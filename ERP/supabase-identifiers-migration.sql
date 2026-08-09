-- Execute no Supabase: SQL Editor > New query > Run.
-- Identificadores sequenciais de fornecedores e ramo de atividade.

create sequence if not exists public.supplier_number_seq;

alter table public.suppliers add column if not exists supplier_number bigint;
alter table public.suppliers add column if not exists business_sector text;

alter table public.suppliers
  alter column supplier_number set default nextval('public.supplier_number_seq'::regclass);

update public.suppliers
set supplier_number = nextval('public.supplier_number_seq'::regclass)
where supplier_number is null;

create unique index if not exists suppliers_supplier_number_unique
  on public.suppliers (supplier_number);

do $$
declare highest_number bigint;
begin
  select max(supplier_number) into highest_number from public.suppliers;
  if highest_number is not null then
    perform setval('public.supplier_number_seq', highest_number, true);
  end if;
end $$;

-- RCs usam purchase_requests.request_number, gerado automaticamente.
-- Pedidos usam purchase_orders.order_number, gerado automaticamente.
