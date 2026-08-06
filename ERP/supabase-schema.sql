-- Veltrian ERP · estrutura inicial do sistema de compras
-- Execute este arquivo no Supabase: SQL Editor > New query > Run.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('administrador', 'comprador', 'solicitante');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.purchase_status as enum ('rascunho', 'em_cotacao', 'em_aprovacao', 'aprovada', 'reprovada', 'concluida');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role public.app_role not null default 'solicitante',
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  tax_id text unique,
  contact_name text,
  contact_email text,
  contact_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity unique,
  title text not null,
  description text,
  category text not null,
  estimated_value numeric(12, 2) not null check (estimated_value >= 0),
  status public.purchase_status not null default 'rascunho',
  requested_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  quoted_value numeric(12, 2) not null check (quoted_value >= 0),
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
  decided_at timestamptz not null default now(),
  unique (purchase_request_id, approver_id)
);

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.approvals enable row level security;

drop policy if exists "authenticated users read profiles" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "authenticated users read suppliers" on public.suppliers;
drop policy if exists "authenticated users read requests" on public.purchase_requests;
drop policy if exists "users create own requests" on public.purchase_requests;
drop policy if exists "authenticated users update requests" on public.purchase_requests;
drop policy if exists "authenticated users read quotes" on public.quotes;
drop policy if exists "authenticated users read approvals" on public.approvals;

create policy "authenticated users read profiles" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "authenticated users read suppliers" on public.suppliers for select to authenticated using (true);
create policy "authenticated users read requests" on public.purchase_requests for select to authenticated using (true);
create policy "users create own requests" on public.purchase_requests for insert to authenticated with check (requested_by = auth.uid());
create policy "authenticated users update requests" on public.purchase_requests for update to authenticated using (true) with check (true);
create policy "authenticated users read quotes" on public.quotes for select to authenticated using (true);
create policy "authenticated users read approvals" on public.approvals for select to authenticated using (true);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

insert into public.profiles (id, full_name, email)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), email
from auth.users
on conflict (id) do nothing;
