-- Tenant-scoped machine-to-project assignments with operator binding.
-- Only one active assignment per machine per tenant is enforced via unique partial index.

create table public.asignaciones_maquina (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  maquina_id uuid not null references public.maquinas(id) on delete restrict,
  proyecto_id uuid not null references public.proyectos(id) on delete restrict,
  subproyecto_id uuid references public.subproyectos(id) on delete restrict,
  operador_id uuid not null references public.user_profiles(id) on delete restrict,
  tarifa_aplicada numeric not null check (tarifa_aplicada >= 0),
  estado text not null default 'activa' check (estado in ('activa', 'retirada_del_proyecto', 'cerrada_por_finalizacion', 'bloqueada_por_conflicto')),
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Unique partial index: only one active assignment per machine per tenant.
create unique index uq_asignacion_activa on public.asignaciones_maquina (tenant_id, maquina_id) where estado = 'activa';

create index idx_asignaciones_tenant_id on public.asignaciones_maquina (tenant_id);
create index idx_asignaciones_tenant_estado on public.asignaciones_maquina (tenant_id, estado);

drop trigger if exists asignaciones_maquina_updated_at on public.asignaciones_maquina;
create trigger asignaciones_maquina_updated_at before update on public.asignaciones_maquina for each row execute function public.set_updated_at();

alter table public.asignaciones_maquina enable row level security;

create policy "asignaciones deny all" on public.asignaciones_maquina for all to authenticated using (false) with check (false);

-- RPC: create_asignacion
-- Validates assignments:create capability, checks machine type=por_tiempo, machine active,
-- project active, operator has rol operador, then INSERT.
create or replace function public.create_asignacion(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_maquina_id uuid,
  p_proyecto_id uuid,
  p_subproyecto_id uuid default null,
  p_operador_id uuid,
  p_tarifa_aplicada numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_machine_tipo text;
  v_machine_estado text;
  v_project_estado text;
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
    raise exception 'Machine not found in tenant' using errcode = '23514';
  end if;
  if v_machine_tipo <> 'por_tiempo' then
    raise exception 'Only por_tiempo machines can be assigned to a project' using errcode = '23514';
  end if;
  if v_machine_estado <> 'activa' then
    raise exception 'Machine must be active to be assigned' using errcode = '23514';
  end if;

  -- Validate project is active
  select estado into v_project_estado
  from public.proyectos
  where id = p_proyecto_id and tenant_id = p_tenant_id;

  if v_project_estado is null then
    raise exception 'Project not found in tenant' using errcode = '23514';
  end if;
  if v_project_estado <> 'activo' then
    raise exception 'Project must be active to assign a machine' using errcode = '23514';
  end if;

  -- Validate subproject belongs to the project and tenant (if provided)
  if p_subproyecto_id is not null then
    if not exists (
      select 1 from public.subproyectos
      where id = p_subproyecto_id
        and tenant_id = p_tenant_id
        and proyecto_id = p_proyecto_id
    ) then
      raise exception 'Subproject not found or does not belong to the given project/tenant' using errcode = '23514';
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
    raise exception 'Selected user does not have operador role in this tenant' using errcode = '23514';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  insert into public.asignaciones_maquina (tenant_id, maquina_id, proyecto_id, subproyecto_id, operador_id, tarifa_aplicada, estado)
  values (p_tenant_id, p_maquina_id, p_proyecto_id, p_subproyecto_id, p_operador_id, p_tarifa_aplicada, 'activa')
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

-- RPC: update_asignacion
-- Validates assignments:update capability, updates estado, sets fecha_fin when retiring/closing.
create or replace function public.update_asignacion(
  p_actor_id uuid,
  p_audit_source text,
  p_asignacion_id uuid,
  p_estado text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_updated_count integer;
begin
  select tenant_id into v_tenant_id
  from public.asignaciones_maquina
  where id = p_asignacion_id;

  if v_tenant_id is null then
    raise exception 'Assignment not found' using errcode = '23514';
  end if;

  if not public.app_user_has_capability(p_actor_id, v_tenant_id, 'assignments:update') then
    raise exception 'Actor lacks assignments:update capability' using errcode = '42501';
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

-- RPC: list_asignaciones_activas
-- Returns jsonb[] with joined machine, project, operator details for UI display.
create or replace function public.list_asignaciones_activas(
  p_tenant_id uuid
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
      up.full_name as operador_nombre,
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
    order by a.fecha_inicio desc
  ) r;

  return v_result;
end;
$$;

-- Audit trigger
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

drop trigger if exists audit_asignaciones_maquina on public.asignaciones_maquina;
create trigger audit_asignaciones_maquina
  after insert or update or delete on public.asignaciones_maquina
  for each row
  execute function public.audit_asignaciones_maquina();

-- Revoke execute from public and authenticated; grant to service_role.
revoke execute on function public.create_asignacion(uuid, text, uuid, uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.update_asignacion(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.list_asignaciones_activas(uuid) from public, anon, authenticated;
grant execute on function public.create_asignacion(uuid, text, uuid, uuid, uuid, uuid, uuid, numeric) to service_role;
grant execute on function public.update_asignacion(uuid, text, uuid, text) to service_role;
grant execute on function public.list_asignaciones_activas(uuid) to service_role;
