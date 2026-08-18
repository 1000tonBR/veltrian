-- Rastreamento auditável do envio de pedidos por e-mail.
-- O status "recebido" representa a confirmação explícita do fornecedor.
create table if not exists public.order_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  recipient_email text not null,
  status text not null check (status in ('enviado', 'recebido')),
  provider_message_id text,
  confirmation_token_hash text not null,
  confirmation_expires_at timestamptz not null,
  sent_by uuid not null references public.profiles(id),
  sent_at timestamptz not null default now(),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_email_deliveries_order_unique unique (purchase_order_id),
  constraint order_email_deliveries_token_unique unique (confirmation_token_hash),
  constraint order_email_deliveries_received_at_check check (
    (status = 'enviado' and received_at is null)
    or (status = 'recebido' and received_at is not null)
  )
);

create index if not exists order_email_deliveries_status_sent_at_idx
  on public.order_email_deliveries (status, sent_at desc);
create index if not exists order_email_deliveries_sent_by_idx
  on public.order_email_deliveries (sent_by);

alter table public.order_email_deliveries enable row level security;

revoke all on table public.order_email_deliveries from anon, authenticated;
grant select on table public.order_email_deliveries to authenticated;

drop policy if exists "authenticated users read order email deliveries" on public.order_email_deliveries;
create policy "authenticated users read order email deliveries"
on public.order_email_deliveries
for select
to authenticated
using (true);

comment on table public.order_email_deliveries is
  'Auditoria de envio e confirmação de recebimento de pedidos de compra por e-mail.';
comment on column public.order_email_deliveries.status is
  'enviado: aceito pelo provedor; recebido: fornecedor confirmou pelo link seguro.';
