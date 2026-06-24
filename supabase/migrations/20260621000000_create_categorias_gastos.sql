-- Tenant-scoped expense category catalog.

create table if not exists public.categorias_gastos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'oculto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_categorias_gastos_tenant_id
  on public.categorias_gastos (tenant_id);

create index if not exists idx_categorias_gastos_tenant_estado
  on public.categorias_gastos (tenant_id, estado);

create unique index if not exists uq_categorias_gastos_tenant_active_nombre
  on public.categorias_gastos (tenant_id, lower(trim(nombre)))
  where estado = 'activo';

drop trigger if exists categorias_gastos_updated_at on public.categorias_gastos;

create trigger categorias_gastos_updated_at
  before update on public.categorias_gastos
  for each row
  execute function set_updated_at();

alter table public.categorias_gastos enable row level security;

create policy "categorias_gastos tenant isolation - SELECT"
  on public.categorias_gastos
  for select
  to authenticated
  using (
    tenant_id = public.current_app_tenant_id()
    and public.current_app_user_has_capability('categories:read')
  );

create policy "categorias_gastos tenant isolation - INSERT"
  on public.categorias_gastos
  for insert
  to authenticated
  with check (false);

create policy "categorias_gastos tenant isolation - UPDATE"
  on public.categorias_gastos
  for update
  to authenticated
  using (false)
  with check (false);

create policy "categorias_gastos tenant isolation - DELETE deny"
  on public.categorias_gastos
  for delete
  to authenticated
  using (false);

drop trigger if exists audit_categorias_gastos_trigger on public.categorias_gastos;
create trigger audit_categorias_gastos_trigger
  after insert or update or delete on public.categorias_gastos
  for each row
  execute function audit_trigger();
