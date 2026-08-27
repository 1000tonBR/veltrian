-- Veltrian ERP: unidades de medida e mini MRP de estoque.

alter table public.items
  add column if not exists unit_of_measure text not null default 'UN',
  add column if not exists controls_stock boolean not null default false,
  add column if not exists minimum_stock numeric,
  add column if not exists maximum_stock numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'items_unit_of_measure_not_blank'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_unit_of_measure_not_blank
      check (btrim(unit_of_measure) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'items_stock_limits_valid'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_stock_limits_valid
      check (
        (not controls_stock and minimum_stock is null and maximum_stock is null)
        or
        (controls_stock and minimum_stock is not null and maximum_stock is not null
          and minimum_stock >= 0 and maximum_stock >= minimum_stock)
      );
  end if;
end $$;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  movement_type text not null check (movement_type in ('entrada', 'saida')),
  quantity numeric not null check (quantity > 0),
  movement_date date not null default current_date,
  description text not null check (btrim(description) <> ''),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_item_date_idx
  on public.inventory_movements (item_id, movement_date desc, created_at desc);

create index if not exists inventory_movements_created_by_idx
  on public.inventory_movements (created_by);

alter table public.inventory_movements enable row level security;

drop policy if exists "authenticated read inventory movements" on public.inventory_movements;
create policy "authenticated read inventory movements"
  on public.inventory_movements
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated create own inventory movements" on public.inventory_movements;
create policy "authenticated create own inventory movements"
  on public.inventory_movements
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.items i
      where i.id = item_id and i.controls_stock
    )
  );

revoke all on table public.inventory_movements from anon;
grant select, insert on table public.inventory_movements to authenticated;
grant select, insert, update, delete on table public.inventory_movements to service_role;

create or replace view public.mrp_stock_summary
with (security_invoker = true)
as
select
  i.id,
  i.material_number,
  i.description,
  i.unit_of_measure,
  i.controls_stock,
  i.minimum_stock,
  i.maximum_stock,
  i.active,
  coalesce(sum(
    case
      when m.movement_type = 'entrada' then m.quantity
      when m.movement_type = 'saida' then -m.quantity
      else 0
    end
  ), 0)::numeric as current_stock,
  coalesce(sum(m.quantity) filter (where m.movement_type = 'entrada'), 0)::numeric as total_entries,
  coalesce(sum(m.quantity) filter (where m.movement_type = 'saida'), 0)::numeric as total_exits,
  max(m.movement_date) as last_movement_date
from public.items i
left join public.inventory_movements m on m.item_id = i.id
group by i.id;

revoke all on table public.mrp_stock_summary from anon;
grant select on table public.mrp_stock_summary to authenticated, service_role;

notify pgrst, 'reload schema';
