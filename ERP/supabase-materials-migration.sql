-- Veltrian ERP | Código automático para materiais
-- Execute no Supabase: SQL Editor > New query > Run.

create sequence if not exists public.material_number_seq;

alter table public.items add column if not exists material_number bigint;
alter table public.items
  alter column material_number set default nextval('public.material_number_seq'::regclass);

update public.items
set material_number = nextval('public.material_number_seq'::regclass)
where material_number is null;

create unique index if not exists items_material_number_unique
  on public.items (material_number);

do $$
declare highest_number bigint;
begin
  select max(material_number) into highest_number from public.items;
  if highest_number is not null then
    perform setval('public.material_number_seq', highest_number, true);
  end if;
end $$;
