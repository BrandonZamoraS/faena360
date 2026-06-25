-- Tenant-aware validation config overrides for WhatsApp/n8n flows.

create table if not exists public.tenant_validation_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (
    tipo in (
      'inicio_jornada',
      'cierre_jornada',
      'gasto',
      'compra_combustible',
      'carga_combustible',
      'mantenimiento'
    )
  ),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_tenant_validation_configs_tenant_tipo
  on public.tenant_validation_configs (tenant_id, tipo);

create index if not exists idx_tenant_validation_configs_tenant_id
  on public.tenant_validation_configs (tenant_id);

drop trigger if exists tenant_validation_configs_updated_at on public.tenant_validation_configs;

create trigger tenant_validation_configs_updated_at
  before update on public.tenant_validation_configs
  for each row
  execute function set_updated_at();

alter table public.tenant_validation_configs enable row level security;

create policy "tenant_validation_configs tenant isolation - SELECT"
  on public.tenant_validation_configs
  for select
  to authenticated
  using (
    tenant_id = public.current_app_tenant_id()
    and public.current_app_user_has_capability('whatsapp.channel.access')
  );

create policy "tenant_validation_configs tenant isolation - INSERT"
  on public.tenant_validation_configs
  for insert
  to authenticated
  with check (false);

create policy "tenant_validation_configs tenant isolation - UPDATE"
  on public.tenant_validation_configs
  for update
  to authenticated
  using (false)
  with check (false);

create policy "tenant_validation_configs tenant isolation - DELETE deny"
  on public.tenant_validation_configs
  for delete
  to authenticated
  using (false);

drop trigger if exists audit_tenant_validation_configs_trigger on public.tenant_validation_configs;
create trigger audit_tenant_validation_configs_trigger
  after insert or update or delete on public.tenant_validation_configs
  for each row
  execute function audit_trigger();
