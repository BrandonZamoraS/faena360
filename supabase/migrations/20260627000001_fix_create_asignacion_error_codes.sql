-- Replace create_asignacion RPC with specific error codes instead of generic 23514.
-- Previously all validation errors used errcode = '23514' (check_violation), which
-- made it impossible for the application layer to distinguish machine-not-por_tiempo
-- from machine-not-active, project-not-active, user-not-operador, etc.
-- This migration assigns a unique, stable errcode to each validation case so the
-- TypeScript service can map them to domain-specific AssignmentErrorCode values.

create or replace function public.create_asignacion(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_maquina_id uuid,
  p_proyecto_id uuid,
  p_operador_id uuid,
  p_tarifa_aplicada numeric,
  p_subproyecto_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_machine_tipo text;
  v_machine_estado text;
  v_project_estado text;
  v_auth_user_id uuid;
  v_assignment_id uuid;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'assignments:create') then
    raise exception 'Actor lacks assignments:create capability' using errcode = '42501';
  end if;

  -- Validate machine type is por_tiempo and active
  select tipo, estado into v_machine_tipo, v_machine_estado
  from public.maquinas
  where id = p_maquina_id and tenant_id = p_tenant_id;

  if v_machine_tipo is null then
    raise exception 'Machine not found in tenant' using errcode = 'MCH01';
  end if;
  if v_machine_tipo <> 'por_tiempo' then
    raise exception 'Only por_tiempo machines can be assigned to a project' using errcode = 'MCH02';
  end if;
  if v_machine_estado <> 'activa' then
    raise exception 'Machine must be active to be assigned' using errcode = 'MCH03';
  end if;

  -- Validate project is active
  select estado into v_project_estado
  from public.proyectos
  where id = p_proyecto_id and tenant_id = p_tenant_id;

  if v_project_estado is null then
    raise exception 'Project not found in tenant' using errcode = 'PRJ01';
  end if;
  if v_project_estado <> 'activo' then
    raise exception 'Project must be active to assign a machine' using errcode = 'PRJ02';
  end if;

  -- Validate subproject belongs to the project and tenant (if provided)
  if p_subproyecto_id is not null then
    if not exists (
      select 1 from public.subproyectos
      where id = p_subproyecto_id
        and tenant_id = p_tenant_id
        and proyecto_id = p_proyecto_id
    ) then
      raise exception 'Subproject not found or does not belong to the given project/tenant' using errcode = 'SUB01';
    end if;
  end if;

  -- Validate operator has rol 'operador' in the tenant
  if not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_operador_id
      and ur.tenant_id = p_tenant_id
      and r.tenant_id = p_tenant_id
      and r.name = 'operador'
  ) then
    raise exception 'Selected user does not have operador role in this tenant' using errcode = 'USR01';
  end if;

  -- Resolve auth.users id for created_by FK
  select up.auth_user_id into v_auth_user_id
  from public.user_profiles up
  where up.id = p_actor_id;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  insert into public.asignaciones_maquina (tenant_id, maquina_id, proyecto_id, operador_id, tarifa_aplicada, subproyecto_id, estado, created_by)
  values (p_tenant_id, p_maquina_id, p_proyecto_id, p_operador_id, p_tarifa_aplicada, p_subproyecto_id, 'activa', v_auth_user_id)
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;
