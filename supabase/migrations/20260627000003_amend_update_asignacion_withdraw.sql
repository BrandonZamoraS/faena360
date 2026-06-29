-- Amend update_asignacion RPC to split capability checks:
--   'retirada_del_proyecto' → assignments:withdraw
--   all other estados     → assignments:update
--
-- Previously all estados required assignments:update, which made withdrawal
-- indistinguishable from close/block at the authorization level.
-- Related: Issue #64 — Retirar manualmente una máquina de un proyecto.

create or replace function public.update_asignacion(
  p_actor_id uuid,
  p_audit_source text,
  p_asignacion_id uuid,
  p_estado text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_current_estado text;
  v_updated_count integer;
begin
  select tenant_id, estado into v_tenant_id, v_current_estado
  from public.asignaciones_maquina
  where id = p_asignacion_id;

  if v_tenant_id is null then
    raise exception 'Assignment not found' using errcode = 'ASG02';
  end if;

  if v_current_estado <> 'activa' then
    raise exception 'Only active assignments can be updated' using errcode = 'ASG01';
  end if;

  -- Split capability check: withdraw requires assignments:withdraw,
  -- close/block require assignments:update.
  if p_estado = 'retirada_del_proyecto' then
    if not public.app_user_has_capability(p_actor_id, v_tenant_id, 'assignments:withdraw') then
      raise exception 'Actor lacks assignments:withdraw capability' using errcode = '42501';
    end if;
  else
    if not public.app_user_has_capability(p_actor_id, v_tenant_id, 'assignments:update') then
      raise exception 'Actor lacks assignments:update capability' using errcode = '42501';
    end if;
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.asignaciones_maquina
     set estado = p_estado,
         fecha_fin = case when p_estado in ('retirada_del_proyecto', 'cerrada_por_finalizacion') then now() else fecha_fin end
   where id = p_asignacion_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- Permissions: revoke from public, grant to service_role (same as original).
-- The signature is unchanged, so revoke/grant re-assert the existing policy.
revoke execute on function public.update_asignacion(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.update_asignacion(uuid, text, uuid, text) to service_role;
