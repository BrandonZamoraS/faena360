-- Extend audit_asignaciones_maquina trigger to include id in UPDATE diffs,
-- add optional filters to list_asignaciones_activas, create list_asignacion_historial
-- RPC, and add performance indexes.
--
-- Related: Issue #63 — consultar asignaciones activas e historial por rol.

-- ============================================================
-- 1. Modify trigger to include id in UPDATE old_value/new_value
-- ============================================================
create or replace function public.audit_asignaciones_maquina()
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
  _action := 'asignacion.' ||
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
    _old_value := jsonb_set(coalesce(_old_value, '{}'), '{id}', to_jsonb(old.id));

    select jsonb_object_agg(key, value)
      into _new_value
    from jsonb_each(to_jsonb(new))
    where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;
    _new_value := jsonb_set(coalesce(_new_value, '{}'), '{id}', to_jsonb(new.id));
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

-- ============================================================
-- 2. Performance indexes
-- ============================================================

-- Composite index for project-based filtering on active assignments
create index if not exists idx_asignaciones_tenant_proyecto
  on public.asignaciones_maquina (tenant_id, proyecto_id);

-- Composite index for combined filter + status reporting
create index if not exists idx_asignaciones_tenant_proyecto_estado
  on public.asignaciones_maquina (tenant_id, proyecto_id, estado);

-- Partial expression index to accelerate assignment-id lookups in audit_log
-- Index expression matches the cast used in list_asignacion_historial WHERE clause
create index if not exists idx_audit_log_assignment_id
  on public.audit_log (((new_value->>'id')::uuid))
  where action like 'asignacion.%';

-- ============================================================
-- 3. Extend list_asignaciones_activas with optional filters
-- ============================================================
create or replace function public.list_asignaciones_activas(
  p_tenant_id uuid,
  p_proyecto_id uuid default null,
  p_maquina_id uuid default null
) returns jsonb[] language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb[];
begin
  select coalesce(array_agg(row_to_json(r)::jsonb), array[]::jsonb[])
  into v_result
  from (
    select
      a.id,
      a.tenant_id,
      a.maquina_id,
      m.codigo as maquina_codigo,
      a.proyecto_id,
      p.nombre as proyecto_nombre,
      a.subproyecto_id,
      s.nombre as subproyecto_nombre,
      a.operador_id,
      up.full_name as operador_full_name,
      up.email as operador_email,
      a.tarifa_aplicada,
      a.estado,
      a.fecha_inicio,
      a.fecha_fin,
      a.created_at,
      a.updated_at
    from public.asignaciones_maquina a
    join public.maquinas m on m.id = a.maquina_id
    join public.proyectos p on p.id = a.proyecto_id
    left join public.subproyectos s on s.id = a.subproyecto_id
    join public.user_profiles up on up.id = a.operador_id
    where a.tenant_id = p_tenant_id
      and a.estado = 'activa'
      and a.proyecto_id = coalesce(p_proyecto_id, a.proyecto_id)
      and a.maquina_id = coalesce(p_maquina_id, a.maquina_id)
    order by a.fecha_inicio desc
  ) r;

  return v_result;
end;
$$;

-- ============================================================
-- 4. New RPC: list_asignacion_historial
-- ============================================================
create or replace function public.list_asignacion_historial(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_asignacion_id uuid
) returns jsonb[] language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb[];
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'assignments:read') then
    raise exception 'Actor lacks assignments:read capability' using errcode = '42501';
  end if;

  select coalesce(array_agg(row_to_json(r)::jsonb), array[]::jsonb[])
  into v_result
  from (
    select
      occurred_at,
      action,
      actor_user_id,
      old_value,
      new_value,
      source
    from public.audit_log
    where tenant_id = p_tenant_id
      and action like 'asignacion.%'
      and (
        (new_value->>'id')::uuid = p_asignacion_id
        or (old_value->>'id')::uuid = p_asignacion_id
      )
    order by occurred_at desc, id desc
  ) r;

  return v_result;
end;
$$;

-- ============================================================
-- 5. Revoke / grant execute permissions
-- ============================================================

-- Revoke old signature of list_asignaciones_activas (single param)
revoke execute on function public.list_asignaciones_activas(uuid) from public, anon, authenticated;
-- Note: service_role retains execute on the old single-param overload
-- to avoid breaking existing callers during rolling deploy.
-- The old overload will be dropped once all callers have migrated.
-- Revoke new extended signatures
revoke execute on function public.list_asignaciones_activas(uuid, uuid, uuid) from public, anon, authenticated;
-- Revoke historial
revoke execute on function public.list_asignacion_historial(uuid, uuid, uuid) from public, anon, authenticated;

-- Grant execute to service_role for all signatures
grant execute on function public.list_asignaciones_activas(uuid, uuid, uuid) to service_role;
grant execute on function public.list_asignacion_historial(uuid, uuid, uuid) to service_role;
