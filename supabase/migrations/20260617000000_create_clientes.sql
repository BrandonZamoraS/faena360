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

create or replace function public.current_app_user_has_capability(capability_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select up.id as user_id, up.tenant_id
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.tenant_id = public.current_app_tenant_id()
  ), role_grants as (
    select c.key
    from current_profile cp
    join public.user_roles ur
      on ur.user_id = cp.user_id
     and ur.tenant_id = cp.tenant_id
    join public.role_capabilities rc
      on rc.role_id = ur.role_id
    join public.capabilities c
      on c.id = rc.capability_id
    where c.key = capability_key
  ), override_rows as (
    select uco.grant_type
    from current_profile cp
    join public.capabilities c
      on c.key = capability_key
    join public.user_capability_overrides uco
      on uco.user_id = cp.user_id
     and uco.tenant_id = cp.tenant_id
     and uco.capability_id = c.id
  )
  select (
      exists (select 1 from role_grants)
      or exists (select 1 from override_rows where grant_type = 'allow')
    )
    and not exists (select 1 from override_rows where grant_type = 'deny');
$$;

create policy "clientes tenant isolation - SELECT"
  on clientes
  for select
  to authenticated
  using (
    tenant_id = current_app_tenant_id()
    and public.current_app_user_has_capability('clients:read')
  );

create policy "clientes tenant isolation - INSERT"
  on clientes
  for insert
  to authenticated
  with check (false);

create policy "clientes tenant isolation - UPDATE"
  on clientes
  for update
  to authenticated
  using (false)
  with check (false);

create policy "clientes tenant isolation - DELETE deny"
  on clientes
  for delete
  to authenticated
  using (false);

create or replace function public.app_user_has_capability(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with role_grants as (
    select c.key
    from public.user_profiles up
    join public.user_roles ur
      on ur.user_id = up.id
     and ur.tenant_id = up.tenant_id
    join public.role_capabilities rc
      on rc.role_id = ur.role_id
    join public.capabilities c
      on c.id = rc.capability_id
    where up.id = p_actor_user_id
      and up.tenant_id = p_tenant_id
      and c.key = p_capability_key
  ), override_rows as (
    select uco.grant_type
    from public.user_profiles up
    join public.capabilities c
      on c.key = p_capability_key
    join public.user_capability_overrides uco
      on uco.user_id = up.id
     and uco.tenant_id = up.tenant_id
     and uco.capability_id = c.id
    where up.id = p_actor_user_id
      and up.tenant_id = p_tenant_id
  )
  select (
      exists (select 1 from role_grants)
      or exists (select 1 from override_rows where grant_type = 'allow')
    )
    and not exists (select 1 from override_rows where grant_type = 'deny');
$$;

create or replace function public.create_cliente(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_nombre text,
  p_telefono text default null,
  p_correo text default null,
  p_identificacion text default null,
  p_direccion text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'clients:create') then
    raise exception 'Actor lacks clients:create capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  insert into public.clientes (
    tenant_id,
    nombre,
    telefono,
    correo,
    identificacion,
    direccion,
    estado
  ) values (
    p_tenant_id,
    p_nombre,
    p_telefono,
    p_correo,
    p_identificacion,
    p_direccion,
    'activo'
  )
  returning id into v_client_id;

  return v_client_id;
end;
$$;

create or replace function public.update_cliente(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_client_id uuid,
  p_nombre text,
  p_telefono text default null,
  p_correo text default null,
  p_identificacion text default null,
  p_direccion text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'clients:update') then
    raise exception 'Actor lacks clients:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.clientes
  set nombre = p_nombre,
      telefono = p_telefono,
      correo = p_correo,
      identificacion = p_identificacion,
      direccion = p_direccion
  where tenant_id = p_tenant_id
    and id = p_client_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.hide_cliente(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'clients:update') then
    raise exception 'Actor lacks clients:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.clientes
  set estado = 'oculto'
  where tenant_id = p_tenant_id
    and id = p_client_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke execute on function public.app_user_has_capability(uuid, uuid, text) from public;
revoke execute on function public.create_cliente(uuid, text, uuid, text, text, text, text, text) from public;
revoke execute on function public.update_cliente(uuid, text, uuid, uuid, text, text, text, text, text) from public;
revoke execute on function public.hide_cliente(uuid, text, uuid, uuid) from public;
revoke execute on function public.app_user_has_capability(uuid, uuid, text) from anon, authenticated;
revoke execute on function public.create_cliente(uuid, text, uuid, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.update_cliente(uuid, text, uuid, uuid, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.hide_cliente(uuid, text, uuid, uuid) from anon, authenticated;
grant execute on function public.app_user_has_capability(uuid, uuid, text) to service_role;
grant execute on function public.create_cliente(uuid, text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.update_cliente(uuid, text, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.hide_cliente(uuid, text, uuid, uuid) to service_role;

create or replace function public.audit_clientes_trigger()
returns trigger
language plpgsql
as $$
declare
  _actor_id uuid := nullif(current_setting('app.current_actor_id', true), '')::uuid;
  _source text := coalesce(nullif(current_setting('app.audit_source', true), ''), 'system');
  _target_id uuid := nullif(current_setting('app.audit_target_id', true), '')::uuid;
  _action text;
  _old_value jsonb := null;
  _new_value jsonb := null;
begin
  _action := 'cliente.' ||
    case TG_OP
      when 'INSERT' then 'create'
      when 'UPDATE' then 'update'
      when 'DELETE' then 'delete'
    end;

  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(key, value)
    into _old_value
    from jsonb_each(to_jsonb(old))
    where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;

    select jsonb_object_agg(key, value)
    into _new_value
    from jsonb_each(to_jsonb(new))
    where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;
  elsif TG_OP = 'INSERT' then
    _new_value := to_jsonb(new);
  elsif TG_OP = 'DELETE' then
    _old_value := to_jsonb(old);
  end if;

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
    _old_value,
    _new_value,
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
