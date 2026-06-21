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
    and id = p_fuel_type_id
    and estado = 'activo';

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

-- Audit trigger for tipos_combustible (matches clientes pattern).
create or replace function public.audit_tipos_combustible_trigger()
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
  _action := 'tipo_combustible.' ||
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

create trigger audit_tipos_combustible_trigger
  after insert or update or delete on tipos_combustible
  for each row
  execute function public.audit_tipos_combustible_trigger();
