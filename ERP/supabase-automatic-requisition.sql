-- Veltrian ERP: configuração de requisição automática por material.

alter table public.items
  add column if not exists automatic_requisition boolean not null default false,
  add column if not exists automatic_requisition_strategy text;

alter table public.purchase_requests
  add column if not exists origin text not null default 'manual',
  add column if not exists automatic_source_item_id uuid,
  add column if not exists automatic_active boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'items_automatic_requisition_valid'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_automatic_requisition_valid
      check (
        (not automatic_requisition and automatic_requisition_strategy is null)
        or
        (automatic_requisition and controls_stock
          and automatic_requisition_strategy in ('stk_max', 'mediana')
          and (automatic_requisition_strategy <> 'mediana' or maximum_stock > minimum_stock))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_requests_automatic_source_item_fkey'
      and conrelid = 'public.purchase_requests'::regclass
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_automatic_source_item_fkey
      foreign key (automatic_source_item_id) references public.items(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_requests_origin_check'
      and conrelid = 'public.purchase_requests'::regclass
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_origin_check
      check (origin in ('manual', 'automatic'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_requests_automatic_metadata_valid'
      and conrelid = 'public.purchase_requests'::regclass
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_automatic_metadata_valid
      check (
        (origin = 'manual' and automatic_source_item_id is null and not automatic_active)
        or
        (origin = 'automatic' and automatic_source_item_id is not null)
      );
  end if;
end $$;

create index if not exists purchase_requests_automatic_source_item_idx
  on public.purchase_requests (automatic_source_item_id);

create unique index if not exists purchase_requests_one_active_auto_per_item_uidx
  on public.purchase_requests (automatic_source_item_id)
  where origin = 'automatic' and automatic_active;

create or replace function public.evaluate_automatic_purchase_request(p_item_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  material public.items%rowtype;
  current_stock numeric;
  request_quantity numeric;
  request_id uuid;
  strategy_label text;
  requester_id uuid;
begin
  requester_id := auth.uid();
  if requester_id is null then
    return null;
  end if;

  select *
  into material
  from public.items
  where id = p_item_id
  for update;

  if not found then
    return null;
  end if;

  select coalesce(sum(
    case
      when movement_type = 'entrada' then quantity
      when movement_type = 'saida' then -quantity
      else 0
    end
  ), 0)
  into current_stock
  from public.inventory_movements
  where item_id = material.id;

  if material.minimum_stock is not null and current_stock >= material.minimum_stock then
    update public.purchase_requests
    set automatic_active = false
    where origin = 'automatic'
      and automatic_source_item_id = material.id
      and automatic_active;
    return null;
  end if;

  if not material.active
    or not material.controls_stock
    or not material.automatic_requisition
    or material.automatic_requisition_strategy not in ('stk_max', 'mediana')
    or material.minimum_stock is null
    or material.maximum_stock is null
    or current_stock >= material.minimum_stock then
    return null;
  end if;

  if exists (
    select 1
    from public.purchase_requests pr
    where pr.origin = 'automatic'
      and pr.automatic_source_item_id = material.id
      and pr.automatic_active
  ) then
    return null;
  end if;

  if exists (
    select 1
    from public.purchase_request_items pri
    join public.purchase_requests pr on pr.id = pri.purchase_request_id
    left join lateral (
      select po.status
      from public.purchase_orders po
      where po.purchase_request_id = pr.id
      order by po.created_at desc, po.order_number desc
      limit 1
    ) latest_order on true
    where pri.item_id = material.id
      and (pr.origin <> 'automatic' or pr.automatic_active)
      and (
        (latest_order.status is null and pr.status in ('rascunho', 'em_cotacao', 'em_aprovacao', 'aprovada'))
        or latest_order.status in ('rascunho', 'em_aprovacao', 'aprovado', 'reprovado')
      )
  ) then
    return null;
  end if;

  if material.automatic_requisition_strategy = 'stk_max' then
    request_quantity := material.maximum_stock - current_stock;
    strategy_label := 'Stk máx';
  else
    request_quantity := material.maximum_stock - material.minimum_stock;
    strategy_label := 'Mediana';
  end if;

  if request_quantity <= 0 then
    return null;
  end if;

  insert into public.purchase_requests (
    title,
    description,
    category,
    estimated_value,
    status,
    requested_by,
    priority,
    origin,
    automatic_source_item_id,
    automatic_active
  ) values (
    material.description,
    format(
      'Requisição automática gerada pelo MRP. Critério: %s. Saldo no disparo: %s %s.',
      strategy_label,
      current_stock,
      material.unit_of_measure
    ),
    'Compras',
    0,
    'rascunho',
    requester_id,
    'normal',
    'automatic',
    material.id,
    true
  )
  on conflict (automatic_source_item_id)
    where origin = 'automatic' and automatic_active
    do nothing
  returning id into request_id;

  if request_id is not null then
    insert into public.purchase_request_items (
      purchase_request_id,
      item_id,
      quantity,
      notes
    ) values (
      request_id,
      material.id,
      request_quantity,
      format(
        'Gerada automaticamente pelo MRP com o critério %s. Saldo: %s; mínimo: %s; máximo: %s.',
        strategy_label,
        current_stock,
        material.minimum_stock,
        material.maximum_stock
      )
    );
  end if;

  return request_id;
end;
$$;

revoke all on function public.evaluate_automatic_purchase_request(uuid) from public, anon;
grant execute on function public.evaluate_automatic_purchase_request(uuid) to authenticated;

create or replace function public.create_automatic_purchase_request_from_movement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.evaluate_automatic_purchase_request(new.item_id);
  return new;
end;
$$;

create or replace function public.create_automatic_purchase_request_from_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.evaluate_automatic_purchase_request(new.id);
  return new;
end;
$$;

drop trigger if exists inventory_movements_create_automatic_request
  on public.inventory_movements;

create trigger inventory_movements_create_automatic_request
after insert on public.inventory_movements
for each row
execute function public.create_automatic_purchase_request_from_movement();

drop trigger if exists items_evaluate_automatic_request
  on public.items;

create trigger items_evaluate_automatic_request
after insert or update of active, controls_stock, minimum_stock, maximum_stock,
  automatic_requisition, automatic_requisition_strategy
on public.items
for each row
execute function public.create_automatic_purchase_request_from_item();

comment on column public.items.automatic_requisition is
  'Indica se o material deverá participar da geração automática de requisições de compra.';

comment on column public.items.automatic_requisition_strategy is
  'Critério de quantidade: stk_max repõe até o estoque máximo; mediana usa máximo menos mínimo.';

comment on function public.create_automatic_purchase_request_from_movement() is
  'Gera uma RC automática após movimentação que deixe o saldo abaixo do estoque mínimo.';

comment on function public.create_automatic_purchase_request_from_item() is
  'Reavalia a geração automática ao ativar ou alterar a configuração do material.';

comment on function public.evaluate_automatic_purchase_request(uuid) is
  'Avalia saldo, evita duplicidade e cria a RC automática conforme o critério configurado.';
