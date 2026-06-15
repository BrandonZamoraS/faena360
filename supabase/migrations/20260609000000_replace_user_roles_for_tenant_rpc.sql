create or replace function public.replace_user_roles_for_tenant(
  target_tenant_id uuid,
  target_user_id uuid,
  replacement_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  unique_role_ids uuid[];
  valid_role_count integer;
begin
  -- Deduplicamos dentro de la transacción para que el contrato sea estable aun
  -- si el cliente envía roles repetidos.
  select coalesce(array_agg(distinct role_id), array[]::uuid[])
  into unique_role_ids
  from unnest(coalesce(replacement_role_ids, array[]::uuid[])) as replacement(role_id);

  -- La función corre como security definer; por eso valida explícitamente que
  -- el usuario objetivo pertenece al tenant recibido.
  if not exists (
    select 1
    from public.user_profiles up
    where up.id = target_user_id
      and up.tenant_id = target_tenant_id
  ) then
    raise exception 'Target user does not belong to tenant';
  end if;

  if cardinality(unique_role_ids) > 0 then
    -- Validamos todos los roles antes del delete para que un rol externo o
    -- inexistente no borre las asignaciones actuales.
    select count(*)
    into valid_role_count
    from public.roles r
    where r.tenant_id = target_tenant_id
      and r.id = any(unique_role_ids);

    if valid_role_count <> cardinality(unique_role_ids) then
      raise exception 'Role assignment includes roles outside the tenant';
    end if;
  end if;

  -- Delete e insert viven en la misma función/tx; si algo falla, Postgres hace
  -- rollback y conserva las asignaciones anteriores.
  delete from public.user_roles ur
  where ur.tenant_id = target_tenant_id
    and ur.user_id = target_user_id;

  insert into public.user_roles (tenant_id, user_id, role_id)
  select target_tenant_id, target_user_id, role_id
  from unnest(unique_role_ids) as replacement(role_id);
end;
$$;

-- La operación es privilegiada y debe llamarse solo desde el service-role del
-- backend, nunca desde clientes anon/authenticated.
revoke execute on function public.replace_user_roles_for_tenant(uuid, uuid, uuid[]) from public;
revoke execute on function public.replace_user_roles_for_tenant(uuid, uuid, uuid[]) from anon;
revoke execute on function public.replace_user_roles_for_tenant(uuid, uuid, uuid[]) from authenticated;
grant execute on function public.replace_user_roles_for_tenant(uuid, uuid, uuid[]) to service_role;
