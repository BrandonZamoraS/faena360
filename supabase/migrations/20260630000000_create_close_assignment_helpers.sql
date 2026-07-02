-- Helpers: close active assignments when a project or subproject is finalized.
-- Issue #65: Cerrar asignaciones activas al finalizar proyecto o subproyecto.

-- Performance index for subproject-scoped assignment lookups.
create index idx_asignaciones_tenant_subproyecto_estado
  on public.asignaciones_maquina (tenant_id, subproyecto_id, estado);

--------------------------------------------------------------------
-- close_assignments_for_project
-- Closes all active assignments belonging to the project directly
-- AND to any of its subprojects (regardless of subproject status).
-- Sets audit_source = 'system' so the existing audit trigger records
-- automatic closures.
--------------------------------------------------------------------
create or replace function public.close_assignments_for_project(
  p_tenant_id uuid,
  p_project_id uuid
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_count int := 0;
begin
  perform set_config('app.audit_source', 'system', true);

  update public.asignaciones_maquina
  set estado = 'cerrada_por_finalizacion',
      fecha_fin = now()
  where tenant_id = p_tenant_id
    and estado = 'activa'
    and (
      proyecto_id = p_project_id
      or subproyecto_id in (
        select id from public.subproyectos
        where tenant_id = p_tenant_id
          and proyecto_id = p_project_id
      )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

--------------------------------------------------------------------
-- close_assignments_for_subproject
-- Closes all active assignments belonging to a single subproject.
-- Sets audit_source = 'system' for automatic closure audit trail.
--------------------------------------------------------------------
create or replace function public.close_assignments_for_subproject(
  p_tenant_id uuid,
  p_subproject_id uuid
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_count int := 0;
begin
  perform set_config('app.audit_source', 'system', true);

  update public.asignaciones_maquina
  set estado = 'cerrada_por_finalizacion',
      fecha_fin = now()
  where tenant_id = p_tenant_id
    and subproyecto_id = p_subproject_id
    and estado = 'activa';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Restrict execution to service_role only.
revoke execute on function public.close_assignments_for_project(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.close_assignments_for_subproject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_assignments_for_project(uuid, uuid) to service_role;
grant execute on function public.close_assignments_for_subproject(uuid, uuid) to service_role;
