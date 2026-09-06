-- Veltrian ERP: configuração de requisição automática por material.

alter table public.items
  add column if not exists automatic_requisition boolean not null default false;

comment on column public.items.automatic_requisition is
  'Indica se o material deverá participar da geração automática de requisições de compra.';
