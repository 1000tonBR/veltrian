-- VELTRIAN ERP | APROVACOES, DASHBOARD E CLIENTES
-- Execute uma vez em: Supabase > SQL Editor > New query > Run.
-- Query idempotente: pode ser executada novamente sem duplicar estruturas.

alter type public.app_role add value if not exists 'aprovador';

create sequence if not exists public.client_number_seq;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_number bigint not null default nextval('public.client_number_seq'::regclass),
  legal_name text not null,
  trade_name text,
  tax_id text,
  client_type text not null default 'juridica'
    check (client_type in ('juridica', 'fisica')),
  business_sector text,
  state_registration text,
  municipal_registration text,
  contact_name text,
  contact_email text,
  contact_phone text,
  postal_code text,
  street text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  responsible_id uuid references public.profiles(id),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients add column if not exists client_number bigint;
alter table public.clients add column if not exists responsible_id uuid references public.profiles(id);
alter table public.clients add column if not exists updated_at timestamptz not null default now();
alter table public.clients alter column client_number set default nextval('public.client_number_seq'::regclass);
update public.clients set client_number = nextval('public.client_number_seq'::regclass) where client_number is null;

create unique index if not exists clients_client_number_unique
  on public.clients (client_number);
create unique index if not exists clients_tax_id_unique
  on public.clients (tax_id) where tax_id is not null and tax_id <> '';
create index if not exists clients_responsible_id_idx
  on public.clients (responsible_id);
create index if not exists clients_active_name_idx
  on public.clients (lower(legal_name)) where active;
create index if not exists purchase_orders_pending_approval_idx
  on public.purchase_orders (created_at desc) where status = 'em_aprovacao';
create index if not exists order_approvals_approver_id_idx
  on public.order_approvals (approver_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

revoke all on table public.clients from anon;
grant select, insert, update, delete on table public.clients to authenticated;
grant usage, select on sequence public.client_number_seq to authenticated;

drop policy if exists "authenticated manage clients" on public.clients;
create policy "authenticated manage clients"
on public.clients for all to authenticated
using (true)
with check (true);

drop policy if exists "authenticated manage order approvals" on public.order_approvals;
drop policy if exists "authenticated users read order approvals" on public.order_approvals;
drop policy if exists "authenticated read order approvals" on public.order_approvals;
drop policy if exists "approvers create order decisions" on public.order_approvals;
drop policy if exists "approvers update own order decisions" on public.order_approvals;

grant select, insert, update on table public.order_approvals to authenticated;

create policy "authenticated read order approvals"
on public.order_approvals for select to authenticated
using (true);

create policy "approvers create order decisions"
on public.order_approvals for insert to authenticated
with check (
  approver_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role::text in ('administrador', 'aprovador')
  )
);

create policy "approvers update own order decisions"
on public.order_approvals for update to authenticated
using (
  approver_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role::text in ('administrador', 'aprovador')
  )
)
with check (
  approver_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role::text in ('administrador', 'aprovador')
  )
);

create or replace function public.enforce_purchase_order_approval_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_role text;
begin
  if new.status in ('aprovado', 'reprovado')
     and new.status is distinct from old.status then
    select p.role::text into current_role
    from public.profiles p
    where p.id = (select auth.uid());

    if coalesce(current_role, '') not in ('administrador', 'aprovador') then
      raise exception 'Somente administradores ou aprovadores podem decidir pedidos.';
    end if;
  end if;

  if new.status = 'enviado'
     and old.status not in ('aprovado', 'enviado') then
    raise exception 'O PDF so pode ser emitido depois da aprovacao do pedido.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_purchase_order_approval_transition()
from public, anon, authenticated;

drop trigger if exists purchase_orders_enforce_approval_transition
on public.purchase_orders;
create trigger purchase_orders_enforce_approval_transition
before update of status on public.purchase_orders
for each row execute function public.enforce_purchase_order_approval_transition();

create or replace function public.decide_purchase_order(
  p_order_id uuid,
  p_decision text,
  p_comments text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_role text;
  request_id uuid;
  current_status text;
begin
  if current_user_id is null then
    raise exception 'Sessao expirada.';
  end if;

  select p.role::text into current_role
  from public.profiles p
  where p.id = current_user_id;

  if coalesce(current_role, '') not in ('administrador', 'aprovador') then
    raise exception 'Usuario sem permissao para aprovar pedidos.';
  end if;

  if p_decision not in ('aprovado', 'reprovado') then
    raise exception 'Decisao invalida.';
  end if;

  select po.purchase_request_id, po.status
  into request_id, current_status
  from public.purchase_orders po
  where po.id = p_order_id
  for update;

  if request_id is null then
    raise exception 'Pedido nao encontrado.';
  end if;

  if current_status <> 'em_aprovacao' then
    raise exception 'Este pedido nao esta aguardando aprovacao.';
  end if;

  insert into public.order_approvals (
    purchase_order_id, approver_id, decision, comments, decided_at
  ) values (
    p_order_id, current_user_id, p_decision,
    nullif(trim(coalesce(p_comments, '')), ''), now()
  )
  on conflict (purchase_order_id, approver_id)
  do update set
    decision = excluded.decision,
    comments = excluded.comments,
    decided_at = excluded.decided_at;

  update public.purchase_orders
  set status = p_decision, updated_at = now()
  where id = p_order_id;

  update public.purchase_requests
  set status = case when p_decision = 'aprovado' then 'aprovada'::public.purchase_status
                    else 'em_cotacao'::public.purchase_status end,
      updated_at = now()
  where id = request_id;
end;
$$;

revoke execute on function public.decide_purchase_order(uuid, text, text)
from public, anon;
grant execute on function public.decide_purchase_order(uuid, text, text)
to authenticated;
