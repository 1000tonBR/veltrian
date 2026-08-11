-- VELTRIAN ERP | Evolucao do fluxo de compras
-- Atividades/RCs -> Cotacoes -> Pedidos de compra

alter table public.activities add column if not exists updated_at timestamptz not null default now();
alter table public.items add column if not exists updated_at timestamptz not null default now();
alter table public.suppliers add column if not exists updated_at timestamptz not null default now();
alter table public.purchase_request_items add column if not exists updated_at timestamptz not null default now();

alter table public.quotes add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.quotes add column if not exists net_value numeric(12,2);
alter table public.quotes add column if not exists updated_at timestamptz not null default now();

update public.quotes
set net_value = greatest(quoted_value - coalesce(discount_value, 0), 0)
where net_value is null;

alter table public.quotes alter column net_value set not null;

do $$
begin
  alter table public.quotes add constraint quotes_discount_value_nonnegative check (discount_value >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.quotes add constraint quotes_net_value_nonnegative check (net_value >= 0);
exception when duplicate_object then null;
end $$;

alter table public.purchase_orders add column if not exists quote_id uuid references public.quotes(id);
alter table public.purchase_orders add column if not exists gross_value numeric(12,2) not null default 0;
alter table public.purchase_orders add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.purchase_orders add column if not exists payment_terms text;
alter table public.purchase_orders add column if not exists expected_delivery_date date;
alter table public.purchase_orders add column if not exists notes text;
alter table public.purchase_orders add column if not exists sent_at timestamptz;
alter table public.purchase_orders add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.calculate_quote_net_value()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.discount_value := coalesce(new.discount_value, 0);
  new.net_value := greatest(new.quoted_value - new.discount_value, 0);
  return new;
end;
$$;

drop trigger if exists quotes_calculate_net_value on public.quotes;
create trigger quotes_calculate_net_value
before insert or update of quoted_value, discount_value on public.quotes
for each row execute function public.calculate_quote_net_value();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at before update on public.items
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists purchase_requests_set_updated_at on public.purchase_requests;
create trigger purchase_requests_set_updated_at before update on public.purchase_requests
for each row execute function public.set_updated_at();

drop trigger if exists purchase_request_items_set_updated_at on public.purchase_request_items;
create trigger purchase_request_items_set_updated_at before update on public.purchase_request_items
for each row execute function public.set_updated_at();

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at before update on public.quotes
for each row execute function public.set_updated_at();

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
for each row execute function public.set_updated_at();

create unique index if not exists quotes_request_supplier_unique
  on public.quotes (purchase_request_id, supplier_id);
create unique index if not exists quotes_one_winner_per_request
  on public.quotes (purchase_request_id) where selected;
create unique index if not exists purchase_orders_quote_unique
  on public.purchase_orders (quote_id) where quote_id is not null;

create index if not exists purchase_requests_created_at_idx on public.purchase_requests (created_at desc);
create index if not exists purchase_requests_activity_idx on public.purchase_requests (activity_id);
create index if not exists purchase_requests_requested_by_idx on public.purchase_requests (requested_by);
create index if not exists purchase_request_items_item_idx on public.purchase_request_items (item_id);
create index if not exists quotes_request_net_idx on public.quotes (purchase_request_id, net_value);
create index if not exists quotes_supplier_idx on public.quotes (supplier_id);
create index if not exists purchase_orders_created_at_idx on public.purchase_orders (created_at desc);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_request_idx on public.purchase_orders (purchase_request_id);
create index if not exists purchase_orders_created_by_idx on public.purchase_orders (created_by);

-- Esta funcao so deve ser chamada pelo gatilho de criacao de usuario.
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Remove indices redundantes deixados por versoes anteriores; as constraints
-- unicas originais continuam garantindo a integridade dos dados.
drop index if exists public.approvals_request_approver_unique;
drop index if exists public.order_approvals_order_approver_unique;
drop index if exists public.purchase_request_items_request_item_unique;

-- As politicas RLS e permissoes existentes nao sao ampliadas por esta migracao.
-- O aplicativo continua respeitando as regras de acesso ja configuradas no projeto.
