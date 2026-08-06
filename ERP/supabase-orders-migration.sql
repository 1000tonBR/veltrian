-- Execute no Supabase: SQL Editor > New query > Run.
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity unique,
  purchase_request_id uuid not null references public.purchase_requests(id), supplier_id uuid not null references public.suppliers(id),
  total_value numeric(12,2) not null check (total_value >= 0),
  status text not null default 'em_aprovacao' check (status in ('rascunho','em_aprovacao','aprovado','reprovado','enviado','recebido','cancelado')),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.order_approvals (
  id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  approver_id uuid not null references public.profiles(id), decision text not null check (decision in ('aprovado','reprovado')),
  comments text, decided_at timestamptz not null default now(), unique (purchase_order_id, approver_id)
);
alter table public.purchase_orders enable row level security;
alter table public.order_approvals enable row level security;
drop policy if exists "authenticated users read orders" on public.purchase_orders;
drop policy if exists "authenticated users create orders" on public.purchase_orders;
drop policy if exists "authenticated users update orders" on public.purchase_orders;
drop policy if exists "authenticated users read order approvals" on public.order_approvals;
create policy "authenticated users read orders" on public.purchase_orders for select to authenticated using (true);
create policy "authenticated users create orders" on public.purchase_orders for insert to authenticated with check (created_by = auth.uid());
create policy "authenticated users update orders" on public.purchase_orders for update to authenticated using (true) with check (true);
create policy "authenticated users read order approvals" on public.order_approvals for select to authenticated using (true);
