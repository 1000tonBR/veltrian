-- Veltrian ERP · RCs, itens, atividades e cadastro de fornecedores
-- Execute no Supabase: SQL Editor > New query > Run.

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  manufacturer text,
  serial_number text,
  notes text,
  default_quantity numeric(12,3) check (default_quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.purchase_requests add column if not exists priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente'));
alter table public.purchase_requests add column if not exists activity_id uuid references public.activities(id);

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric(12,3) not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (purchase_request_id, item_id)
);

alter table public.suppliers add column if not exists supplier_type text;
alter table public.suppliers add column if not exists state_registration text;
alter table public.suppliers add column if not exists municipal_registration text;
alter table public.suppliers add column if not exists postal_code text;
alter table public.suppliers add column if not exists street text;
alter table public.suppliers add column if not exists address_number text;
alter table public.suppliers add column if not exists complement text;
alter table public.suppliers add column if not exists neighborhood text;
alter table public.suppliers add column if not exists city text;
alter table public.suppliers add column if not exists state text;
alter table public.suppliers add column if not exists payment_terms text;
alter table public.suppliers add column if not exists bank_name text;
alter table public.suppliers add column if not exists bank_branch text;
alter table public.suppliers add column if not exists bank_account text;
alter table public.suppliers add column if not exists pix_key text;
alter table public.suppliers add column if not exists notes text;

alter table public.activities enable row level security;
alter table public.items enable row level security;
alter table public.purchase_request_items enable row level security;
drop policy if exists "authenticated manage activities" on public.activities;
drop policy if exists "authenticated manage items" on public.items;
drop policy if exists "authenticated manage RC items" on public.purchase_request_items;
drop policy if exists "authenticated manage suppliers" on public.suppliers;
create policy "authenticated manage activities" on public.activities for all to authenticated using (true) with check (true);
create policy "authenticated manage items" on public.items for all to authenticated using (true) with check (true);
create policy "authenticated manage RC items" on public.purchase_request_items for all to authenticated using (true) with check (true);
create policy "authenticated manage suppliers" on public.suppliers for all to authenticated using (true) with check (true);
