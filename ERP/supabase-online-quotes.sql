-- Estrutura da cotação online. O envio de e-mail e o portal externo serão
-- conectados em uma etapa posterior; por enquanto as solicitações ficam
-- auditáveis no status aguardando_envio.

create table if not exists public.quote_invitations (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  recipient_email text not null,
  status text not null default 'aguardando_envio',
  provider_message_id text,
  access_token_hash text,
  expires_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  accessed_at timestamptz,
  responded_at timestamptz,
  cancelled_at timestamptz,
  error_message text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_invitations_request_supplier_unique unique (purchase_request_id, supplier_id),
  constraint quote_invitations_recipient_email_check check (position('@' in recipient_email) > 1),
  constraint quote_invitations_status_check check (status in (
    'aguardando_envio', 'enviada', 'entregue', 'acessada', 'respondida',
    'expirada', 'erro_envio', 'cancelada', 'resposta_tardia'
  ))
);

create unique index if not exists quote_invitations_access_token_hash_uidx
  on public.quote_invitations (access_token_hash)
  where access_token_hash is not null;
create index if not exists quote_invitations_status_created_at_idx
  on public.quote_invitations (status, created_at desc);
create index if not exists quote_invitations_supplier_id_idx
  on public.quote_invitations (supplier_id);
create index if not exists quote_invitations_created_by_idx
  on public.quote_invitations (created_by);

create table if not exists public.quote_response_versions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.quote_invitations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  quoted_value numeric(12,2) not null check (quoted_value >= 0),
  delivery_date date,
  freight_type text check (freight_type is null or freight_type in ('CIF', 'FOB')),
  payment_terms text,
  commercial_notes text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  constraint quote_response_versions_invitation_version_unique unique (invitation_id, version_number)
);

create index if not exists quote_response_versions_invitation_submitted_idx
  on public.quote_response_versions (invitation_id, submitted_at desc);

create or replace function public.prevent_quote_response_version_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O histórico de respostas da cotação é imutável.' using errcode = 'P0001';
end;
$$;

revoke all on function public.prevent_quote_response_version_change() from public, anon, authenticated;

drop trigger if exists quote_response_versions_immutable on public.quote_response_versions;
create trigger quote_response_versions_immutable
before update or delete on public.quote_response_versions
for each row execute function public.prevent_quote_response_version_change();

alter table public.quotes add column if not exists origin text not null default 'manual';
alter table public.quotes add column if not exists online_invitation_id uuid;
alter table public.quotes add column if not exists supplier_submitted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quotes_origin_check'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_origin_check check (origin in ('manual', 'online'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quotes_online_invitation_id_fkey'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_online_invitation_id_fkey
      foreign key (online_invitation_id) references public.quote_invitations(id);
  end if;
end $$;

create unique index if not exists quotes_online_invitation_id_uidx
  on public.quotes (online_invitation_id)
  where online_invitation_id is not null;

create or replace function public.set_quote_invitation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_quote_invitation_updated_at() from public, anon, authenticated;

drop trigger if exists quote_invitations_set_updated_at on public.quote_invitations;
create trigger quote_invitations_set_updated_at
before update on public.quote_invitations
for each row execute function public.set_quote_invitation_updated_at();

create or replace function public.prevent_locked_quote_invitation_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_request_id uuid;
begin
  if current_user = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  target_request_id := case when tg_op = 'DELETE' then old.purchase_request_id else new.purchase_request_id end;
  if exists (
    select 1
    from public.purchase_orders po
    where po.purchase_request_id = target_request_id
      and po.status in ('em_aprovacao', 'aprovado', 'enviado', 'recebido')
  ) then
    raise exception 'A cotação está bloqueada porque o pedido já foi enviado para aprovação.'
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.prevent_locked_quote_invitation_change() from public, anon, authenticated;

drop trigger if exists quote_invitations_lock_after_approval on public.quote_invitations;
create trigger quote_invitations_lock_after_approval
before insert or update or delete on public.quote_invitations
for each row execute function public.prevent_locked_quote_invitation_change();

create or replace function public.prevent_locked_quote_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_request_id uuid;
begin
  target_request_id := case when tg_op = 'DELETE' then old.purchase_request_id else new.purchase_request_id end;

  if exists (
    select 1
    from public.purchase_orders po
    where po.purchase_request_id = target_request_id
      and po.status in ('em_aprovacao', 'aprovado', 'enviado', 'recebido')
  ) then
    raise exception 'A cotação está bloqueada porque o pedido já foi enviado para aprovação.'
      using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.prevent_locked_quote_change() from public, anon, authenticated;

drop trigger if exists quotes_lock_commercial_insert_delete on public.quotes;
create trigger quotes_lock_commercial_insert_delete
before insert or delete on public.quotes
for each row execute function public.prevent_locked_quote_change();

drop trigger if exists quotes_lock_commercial_update on public.quotes;
create trigger quotes_lock_commercial_update
before update of purchase_request_id, supplier_id, quoted_value, discount_value,
  net_value, delivery_days, delivery_date, freight_type, payment_terms, notes,
  origin, online_invitation_id, supplier_submitted_at
on public.quotes
for each row execute function public.prevent_locked_quote_change();

alter table public.quote_invitations enable row level security;
alter table public.quote_response_versions enable row level security;

revoke all on table public.quote_invitations from anon, authenticated;
revoke all on table public.quote_response_versions from anon, authenticated;
grant select on table public.quote_invitations to authenticated;
grant insert (purchase_request_id, supplier_id, recipient_email, status, expires_at, created_by)
  on table public.quote_invitations to authenticated;
grant update (status, cancelled_at, error_message)
  on table public.quote_invitations to authenticated;
grant select on table public.quote_response_versions to authenticated;
grant all on table public.quote_invitations to service_role;
grant all on table public.quote_response_versions to service_role;

drop policy if exists "authenticated users read quote invitations" on public.quote_invitations;
create policy "authenticated users read quote invitations"
on public.quote_invitations for select to authenticated using (true);

drop policy if exists "buyers create quote invitations" on public.quote_invitations;
create policy "buyers create quote invitations"
on public.quote_invitations for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'aguardando_envio'
  and recipient_email = (
    select lower(trim(s.contact_email))
    from public.suppliers s
    where s.id = supplier_id
  )
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('administrador', 'comprador')
  )
);

drop policy if exists "buyers update quote invitations" on public.quote_invitations;
create policy "buyers update quote invitations"
on public.quote_invitations for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('administrador', 'comprador')
  )
)
with check (
  status = 'cancelada'
  and cancelled_at is not null
  and
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('administrador', 'comprador')
  )
);

drop policy if exists "authenticated users read quote response versions" on public.quote_response_versions;
create policy "authenticated users read quote response versions"
on public.quote_response_versions for select to authenticated using (true);

comment on table public.quote_invitations is
  'Solicitações de cotação online, mantidas separadas das propostas até o fornecedor responder.';
comment on table public.quote_response_versions is
  'Histórico imutável das respostas enviadas pelo fornecedor para uma cotação online.';
comment on column public.quotes.origin is
  'manual: lançada pelo comprador; online: recebida por uma solicitação online.';

create or replace function public.record_online_quote_response(
  p_invitation_id uuid,
  p_quoted_value numeric,
  p_delivery_date date,
  p_freight_type text,
  p_payment_terms text,
  p_commercial_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.quote_invitations%rowtype;
  existing_quote public.quotes%rowtype;
  next_version integer;
  is_late boolean;
  applied_discount numeric(12,2);
  response_time timestamptz := now();
begin
  if p_quoted_value is null or p_quoted_value <= 0 then
    raise exception 'O valor total da proposta deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_delivery_date is null or p_delivery_date < current_date then
    raise exception 'Informe uma data de entrega válida.' using errcode = '22023';
  end if;
  if p_freight_type not in ('CIF', 'FOB') then
    raise exception 'Informe um tipo de frete válido.' using errcode = '22023';
  end if;
  if nullif(trim(p_payment_terms), '') is null then
    raise exception 'Informe a condição de pagamento.' using errcode = '22023';
  end if;

  select * into invitation
  from public.quote_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'Solicitação de cotação não encontrada.' using errcode = 'P0002';
  end if;
  if invitation.status = 'cancelada' then
    raise exception 'Esta solicitação foi cancelada.' using errcode = 'P0001';
  end if;
  if invitation.expires_at is not null and invitation.expires_at < response_time
     and invitation.status not in ('respondida', 'resposta_tardia') then
    update public.quote_invitations set status = 'expirada' where id = invitation.id;
    return jsonb_build_object('ok', false, 'expired', true);
  end if;

  is_late := exists (
    select 1 from public.purchase_orders po
    where po.purchase_request_id = invitation.purchase_request_id
      and po.status in ('em_aprovacao', 'aprovado', 'enviado', 'recebido')
  );

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.quote_response_versions
  where invitation_id = invitation.id;

  insert into public.quote_response_versions (
    invitation_id, version_number, quoted_value, delivery_date, freight_type,
    payment_terms, commercial_notes, submitted_at, is_late
  ) values (
    invitation.id, next_version, p_quoted_value, p_delivery_date, p_freight_type,
    trim(p_payment_terms), nullif(trim(p_commercial_notes), ''), response_time, is_late
  );

  if is_late then
    update public.quote_invitations
    set status = 'resposta_tardia', responded_at = response_time
    where id = invitation.id;
    return jsonb_build_object('ok', true, 'late', true, 'version', next_version);
  end if;

  select * into existing_quote
  from public.quotes
  where online_invitation_id = invitation.id
  for update;

  if found then
    applied_discount := least(existing_quote.discount_value, p_quoted_value);
    update public.quotes
    set quoted_value = p_quoted_value,
        discount_value = applied_discount,
        net_value = p_quoted_value - applied_discount,
        delivery_date = p_delivery_date,
        freight_type = p_freight_type,
        payment_terms = trim(p_payment_terms),
        notes = nullif(trim(p_commercial_notes), ''),
        supplier_submitted_at = response_time,
        updated_at = response_time
    where id = existing_quote.id;
  else
    if exists (
      select 1 from public.quotes q
      where q.purchase_request_id = invitation.purchase_request_id
        and q.supplier_id = invitation.supplier_id
    ) then
      raise exception 'Já existe uma cotação manual para este fornecedor.' using errcode = '23505';
    end if;
    insert into public.quotes (
      purchase_request_id, supplier_id, quoted_value, discount_value, net_value,
      delivery_date, freight_type, payment_terms, notes, selected, origin,
      online_invitation_id, supplier_submitted_at
    ) values (
      invitation.purchase_request_id, invitation.supplier_id, p_quoted_value, 0,
      p_quoted_value, p_delivery_date, p_freight_type, trim(p_payment_terms),
      nullif(trim(p_commercial_notes), ''), false, 'online', invitation.id, response_time
    );
  end if;

  update public.quote_invitations
  set status = 'respondida', responded_at = response_time
  where id = invitation.id;
  update public.purchase_requests
  set status = 'em_cotacao'
  where id = invitation.purchase_request_id;

  return jsonb_build_object('ok', true, 'late', false, 'version', next_version);
end;
$$;

revoke all on function public.record_online_quote_response(uuid, numeric, date, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_online_quote_response(uuid, numeric, date, text, text, text)
  to service_role;
