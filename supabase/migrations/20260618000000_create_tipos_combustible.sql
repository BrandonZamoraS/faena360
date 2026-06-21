-- Tenant-scoped fuel type catalog.

create table if not exists public.tipos_combustible (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  estado text not null default 'activo' check (estado in ('activo', 'oculto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tipos_combustible_tenant_id
  on public.tipos_combustible(tenant_id);

create index if not exists idx_tipos_combustible_tenant_estado
  on public.tipos_combustible(tenant_id, estado);

create unique index if not exists uq_tipos_combustible_tenant_active_nombre
  on public.tipos_combustible (tenant_id, lower(trim(nombre)))
  where estado = 'activo';

drop trigger if exists tipos_combustible_updated_at on public.tipos_combustible;

create trigger tipos_combustible_updated_at
  before update on public.tipos_combustible
  for each row
  execute function set_updated_at();

alter table public.tipos_combustible enable row level security;

create policy "tipos_combustible tenant isolation - SELECT"
  on public.tipos_combustible
  for select
  to authenticated
  using (
    tenant_id = public.current_app_tenant_id()
  );

create policy "tipos_combustible tenant isolation - INSERT"
  on public.tipos_combustible
  for insert
  to authenticated
  with check (false);

create policy "tipos_combustible tenant isolation - UPDATE"
  on public.tipos_combustible
  for update
  to authenticated
  using (false)
  with check (false);

create policy "tipos_combustible tenant isolation - DELETE deny"
  on public.tipos_combustible
  for delete
  to authenticated
  using (false);
