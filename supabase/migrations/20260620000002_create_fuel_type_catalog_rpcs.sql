-- Tenant-scoped fuel type catalog RPCs.
-- Matches the clientes RPC pattern exactly: SECURITY DEFINER,
-- capability check, set_config for audit context, mutation, return.

create or replace function public.create_tipo_combustible(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_nombre text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fuel_type_id uuid;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'fuel_types:create') then
    raise exception 'Actor lacks fuel_types:create capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  insert into public.tipos_combustible (
    tenant_id,
    nombre,
    estado
  ) values (
    p_tenant_id,
    p_nombre,
    'activo'
  )
  returning id into v_fuel_type_id;

  return v_fuel_type_id;
end;
$$;

create or replace function public.update_tipo_combustible(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_fuel_type_id uuid,
  p_nombre text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'fuel_types:update') then
    raise exception 'Actor lacks fuel_types:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.tipos_combustible
  set nombre = p_nombre
  where tenant_id = p_tenant_id
    and id = p_fuel_type_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.hide_tipo_combustible(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_fuel_type_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'fuel_types:update') then
    raise exception 'Actor lacks fuel_types:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.tipos_combustible
  set estado = 'oculto'
  where tenant_id = p_tenant_id
    and id = p_fuel_type_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- Execute restricted to service_role (matching clientes pattern).
revoke execute on function public.create_tipo_combustible(uuid, text, uuid, text) from public;
revoke execute on function public.update_tipo_combustible(uuid, text, uuid, uuid, text) from public;
revoke execute on function public.hide_tipo_combustible(uuid, text, uuid, uuid) from public;
revoke execute on function public.create_tipo_combustible(uuid, text, uuid, text) from anon, authenticated;
revoke execute on function public.update_tipo_combustible(uuid, text, uuid, uuid, text) from anon, authenticated;
revoke execute on function public.hide_tipo_combustible(uuid, text, uuid, uuid) from anon, authenticated;
grant execute on function public.create_tipo_combustible(uuid, text, uuid, text) to service_role;
grant execute on function public.update_tipo_combustible(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.hide_tipo_combustible(uuid, text, uuid, uuid) to service_role;
