-- Tenant-scoped client catalog.

create table clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text,
  correo text,
  identificacion text,
  direccion text,
  estado text not null default 'activo' check (estado in ('activo', 'oculto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clientes_tenant_id on clientes(tenant_id);
create index idx_clientes_tenant_estado on clientes(tenant_id, estado);

create trigger clientes_updated_at
  before update on clientes
  for each row
  execute function set_updated_at();

alter table clientes enable row level security;

create policy "clientes tenant isolation - SELECT"
  on clientes
  for select
  to authenticated
  using (tenant_id = current_app_tenant_id());

create policy "clientes tenant isolation - INSERT"
  on clientes
  for insert
  to authenticated
  with check (tenant_id = current_app_tenant_id());

create policy "clientes tenant isolation - UPDATE"
  on clientes
  for update
  to authenticated
  using (tenant_id = current_app_tenant_id())
  with check (tenant_id = current_app_tenant_id());

create policy "clientes tenant isolation - DELETE deny"
  on clientes
  for delete
  to authenticated
  using (false);

create or replace function public.audit_clientes_trigger()
returns trigger
language plpgsql
as $$
declare
  _actor_id uuid := nullif(current_setting('app.current_actor_id', true), '')::uuid;
  _source text := coalesce(nullif(current_setting('app.audit_source', true), ''), 'system');
  _target_id uuid := nullif(current_setting('app.audit_target_id', true), '')::uuid;
  _action text;
begin
  _action := 'cliente.' ||
    case TG_OP
      when 'INSERT' then 'create'
      when 'UPDATE' then 'update'
      when 'DELETE' then 'delete'
    end;

  insert into audit_log (
    tenant_id,
    actor_user_id,
    target_user_id,
    action,
    source,
    old_value,
    new_value,
    occurred_at
  ) values (
    case when TG_OP = 'DELETE' then old.tenant_id else new.tenant_id end,
    _actor_id,
    _target_id,
    _action,
    _source,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    now()
  );

  perform set_config('app.current_actor_id', '', false);
  perform set_config('app.audit_source', '', false);
  perform set_config('app.audit_target_id', '', false);

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger audit_clientes_trigger
  after insert or update or delete on clientes
  for each row
  execute function public.audit_clientes_trigger();
