-- VELTRIAN ERP | QUERY ÚNICA DE ESTRUTURA
-- Pode ser executada uma única vez no Supabase > SQL Editor > New query > Run.
-- É segura para um banco que já tenha parte das tabelas criadas.

create extension if not exists pgcrypto;
create sequence if not exists public.supplier_number_seq;

do $$ begin
  create type public.app_role as enum ('administrador', 'comprador', 'solicitante');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.purchase_status as enum ('rascunho', 'em_cotacao', 'em_aprovacao', 'aprovada', 'reprovada', 'concluida');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role public.app_role not null default 'solicitante',
  created_at timestamptz not null default now()
);

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

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_number bigint not null default nextval('public.supplier_number_seq'::regclass) unique,
  legal_name text not null,
  trade_name text,
  tax_id text unique,
  supplier_type text,
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
  payment_terms text,
  bank_name text,
  bank_branch text,
  bank_account text,
  pix_key text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.suppliers add column if not exists supplier_number bigint;
alter table public.suppliers add column if not exists supplier_type text;
alter table public.suppliers add column if not exists business_sector text;
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
alter table public.suppliers alter column supplier_number set default nextval('public.supplier_number_seq'::regclass);
update public.suppliers set supplier_number = nextval('public.supplier_number_seq'::regclass) where supplier_number is null;
create unique index if not exists suppliers_supplier_number_unique on public.suppliers (supplier_number);

do $$
declare highest_number bigint;
begin
  select max(supplier_number) into highest_number from public.suppliers;
  if highest_number is not null then perform setval('public.supplier_number_seq', highest_number, true); end if;
end $$;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity unique,
  title text not null,
  description text,
  category text not null,
  estimated_value numeric(12,2) not null check (estimated_value >= 0),
  status public.purchase_status not null default 'rascunho',
  requested_by uuid not null references public.profiles(id),
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  activity_id uuid references public.activities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_requests add column if not exists priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente'));
alter table public.purchase_requests add column if not exists activity_id uuid references public.activities(id);

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric(12,3) not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists purchase_request_items_request_item_unique
  on public.purchase_request_items (purchase_request_id, item_id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  quoted_value numeric(12,2) not null check (quoted_value >= 0),
  delivery_days integer check (delivery_days >= 0),
  notes text,
  selected boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  approver_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('aprovada', 'reprovada')),
  comments text,
  decided_at timestamptz not null default now()
);

create unique index if not exists approvals_request_approver_unique
  on public.approvals (purchase_request_id, approver_id);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  purchase_request_id uuid not null references public.purchase_requests(id),
  supplier_id uuid not null references public.suppliers(id),
  total_value numeric(12,2) not null check (total_value >= 0),
  status text not null default 'em_aprovacao' check (status in ('rascunho','em_aprovacao','aprovado','reprovado','enviado','recebido','cancelado')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.order_approvals (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  approver_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('aprovado','reprovado')),
  comments text,
  decided_at timestamptz not null default now()
);

create unique index if not exists order_approvals_order_approver_unique
  on public.order_approvals (purchase_order_id, approver_id);

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.items enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.quotes enable row level security;
alter table public.approvals enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.order_approvals enable row level security;

drop policy if exists "authenticated users read profiles" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "authenticated users read suppliers" on public.suppliers;
drop policy if exists "authenticated users read requests" on public.purchase_requests;
drop policy if exists "users create own requests" on public.purchase_requests;
drop policy if exists "authenticated users update requests" on public.purchase_requests;
drop policy if exists "authenticated users read quotes" on public.quotes;
drop policy if exists "authenticated users read approvals" on public.approvals;
drop policy if exists "authenticated users read orders" on public.purchase_orders;
drop policy if exists "authenticated users create orders" on public.purchase_orders;
drop policy if exists "authenticated users update orders" on public.purchase_orders;
drop policy if exists "authenticated users read order approvals" on public.order_approvals;
drop policy if exists "authenticated manage activities" on public.activities;
drop policy if exists "authenticated manage items" on public.items;
drop policy if exists "authenticated manage RC items" on public.purchase_request_items;
drop policy if exists "authenticated manage suppliers" on public.suppliers;
drop policy if exists "authenticated manage RCs" on public.purchase_requests;
drop policy if exists "authenticated manage quotes" on public.quotes;
drop policy if exists "authenticated manage approvals" on public.approvals;
drop policy if exists "authenticated manage orders" on public.purchase_orders;
drop policy if exists "authenticated manage order approvals" on public.order_approvals;

create policy "authenticated users read profiles" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "authenticated manage activities" on public.activities for all to authenticated using (true) with check (true);
create policy "authenticated manage items" on public.items for all to authenticated using (true) with check (true);
create policy "authenticated manage suppliers" on public.suppliers for all to authenticated using (true) with check (true);
create policy "authenticated manage RCs" on public.purchase_requests for all to authenticated using (true) with check (true);
create policy "authenticated manage RC items" on public.purchase_request_items for all to authenticated using (true) with check (true);
create policy "authenticated manage quotes" on public.quotes for all to authenticated using (true) with check (true);
create policy "authenticated manage approvals" on public.approvals for all to authenticated using (true) with check (true);
create policy "authenticated manage orders" on public.purchase_orders for all to authenticated using (true) with check (true);
create policy "authenticated manage order approvals" on public.order_approvals for all to authenticated using (true) with check (true);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

insert into public.profiles (id, full_name, email)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), email
from auth.users on conflict (id) do nothing;
