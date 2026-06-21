-- Add service-role RPCs for expense category mutations.
-- These keep authorization, mutation, and audit context in one database transaction
-- so audit_log records UI-driven changes with actor/source metadata.

create or replace function public.create_categoria_gasto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_nombre text,
  p_descripcion text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'categories:create') then
    raise exception 'Actor lacks categories:create capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  insert into public.categorias_gastos (
    tenant_id,
    nombre,
    descripcion,
    estado
  ) values (
    p_tenant_id,
    p_nombre,
    p_descripcion,
    'activo'
  )
  returning id into v_category_id;

  return v_category_id;
end;
$$;

create or replace function public.update_categoria_gasto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_category_id uuid,
  p_nombre text,
  p_descripcion text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'categories:update') then
    raise exception 'Actor lacks categories:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.categorias_gastos
  set nombre = p_nombre,
      descripcion = p_descripcion
  where tenant_id = p_tenant_id
    and id = p_category_id
    and estado = 'activo';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.hide_categoria_gasto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_category_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'categories:update') then
    raise exception 'Actor lacks categories:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.categorias_gastos
  set estado = 'oculto'
  where tenant_id = p_tenant_id
    and id = p_category_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke execute on function public.create_categoria_gasto(uuid, text, uuid, text, text) from public;
revoke execute on function public.update_categoria_gasto(uuid, text, uuid, uuid, text, text) from public;
revoke execute on function public.hide_categoria_gasto(uuid, text, uuid, uuid) from public;
revoke execute on function public.create_categoria_gasto(uuid, text, uuid, text, text) from anon, authenticated;
revoke execute on function public.update_categoria_gasto(uuid, text, uuid, uuid, text, text) from anon, authenticated;
revoke execute on function public.hide_categoria_gasto(uuid, text, uuid, uuid) from anon, authenticated;
grant execute on function public.create_categoria_gasto(uuid, text, uuid, text, text) to service_role;
grant execute on function public.update_categoria_gasto(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public.hide_categoria_gasto(uuid, text, uuid, uuid) to service_role;
