-- VELTRIAN ERP | Ajuste do fluxo Cotacoes -> Pedidos
-- Execute uma unica vez no Supabase > SQL Editor > New query.

alter table public.quotes add column if not exists delivery_date date;
alter table public.quotes add column if not exists freight_type text;
alter table public.quotes add column if not exists payment_terms text;
alter table public.purchase_orders add column if not exists selection_reason text;

update public.quotes q
set payment_terms = s.payment_terms
from public.suppliers s
where s.id = q.supplier_id
  and q.payment_terms is null;

update public.quotes
set delivery_date = created_at::date + delivery_days
where delivery_date is null
  and delivery_days is not null;

do $$
begin
  alter table public.quotes
    add constraint quotes_freight_type_check
    check (freight_type is null or freight_type in ('CIF', 'FOB'));
exception when duplicate_object then null;
end $$;

create unique index if not exists purchase_orders_request_unique
  on public.purchase_orders (purchase_request_id);

create or replace function public.validate_order_quote_choice()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  chosen public.quotes%rowtype;
  lowest_value numeric(12,2);
begin
  if new.quote_id is null then
    return new;
  end if;

  select * into chosen
  from public.quotes
  where id = new.quote_id
    and purchase_request_id = new.purchase_request_id;

  if not found then
    raise exception 'A cotacao escolhida nao pertence a esta requisicao.';
  end if;

  select min(net_value) into lowest_value
  from public.quotes
  where purchase_request_id = new.purchase_request_id;

  if chosen.net_value > lowest_value
     and nullif(trim(coalesce(new.selection_reason, '')), '') is null then
    raise exception 'Informe o motivo para escolher uma cotacao acima do menor preco.';
  end if;

  new.supplier_id := chosen.supplier_id;
  new.gross_value := chosen.quoted_value;
  new.discount_value := chosen.discount_value;
  new.total_value := chosen.net_value;
  new.payment_terms := chosen.payment_terms;
  new.expected_delivery_date := chosen.delivery_date;
  return new;
end;
$$;

revoke execute on function public.validate_order_quote_choice() from public, anon, authenticated;

drop trigger if exists purchase_orders_validate_quote on public.purchase_orders;
create trigger purchase_orders_validate_quote
before insert or update of quote_id, purchase_request_id, selection_reason
on public.purchase_orders
for each row execute function public.validate_order_quote_choice();

create index if not exists quotes_delivery_date_idx on public.quotes (delivery_date);
