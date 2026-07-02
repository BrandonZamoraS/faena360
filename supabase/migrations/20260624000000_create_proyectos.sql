-- Tenant-scoped project catalog.

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  cliente_id uuid not null references clientes(id) on delete restrict,
  ubicacion text not null check (length(trim(ubicacion)) > 0),
  fecha_inicio date not null,
  fecha_finalizacion date,
  forma_cobro text not null check (forma_cobro in ('monto_fijo', 'por_horas', 'por_dia')),
  monto_fijo numeric,
  estado text not null default 'activo' check (estado in ('activo', 'pausado', 'finalizado', 'oculto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyectos_monto_fijo_for_monto_fijo_forma check (
    forma_cobro <> 'monto_fijo' or (monto_fijo is not null and monto_fijo > 0)
  )
);

create or replace function public.validate_proyecto_cliente_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.clientes c
    where c.id = new.cliente_id
      and c.tenant_id = new.tenant_id
  ) then
    raise exception 'Referenced client must belong to the same tenant' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger proyectos_cliente_tenant_trigger
  before insert or update of tenant_id, cliente_id on public.proyectos
  for each row
  execute function public.validate_proyecto_cliente_tenant();

create index idx_proyectos_tenant_id on public.proyectos (tenant_id);
create index idx_proyectos_tenant_cliente_id on public.proyectos (tenant_id, cliente_id);
create index idx_proyectos_tenant_estado on public.proyectos (tenant_id, estado);

create unique index uq_proyectos_tenant_active_nombre
  on public.proyectos (tenant_id, lower(trim(nombre)))
  where estado <> 'oculto';

drop trigger if exists proyectos_updated_at on public.proyectos;

create trigger proyectos_updated_at
  before update on public.proyectos
  for each row
  execute function set_updated_at();

alter table public.proyectos enable row level security;

create policy "proyectos tenant isolation - SELECT"
  on public.proyectos
  for select
  to authenticated
  using (
    tenant_id = public.current_app_tenant_id()
    and estado <> 'oculto'
    and public.current_app_user_has_capability('projects:read')
  );

create policy "proyectos tenant isolation - INSERT"
  on public.proyectos
  for insert
  to authenticated
  with check (false);

create policy "proyectos tenant isolation - UPDATE"
  on public.proyectos
  for update
  to authenticated
  using (false)
  with check (false);

create policy "proyectos tenant isolation - DELETE deny"
  on public.proyectos
  for delete
  to authenticated
  using (false);

create or replace function public.count_open_jornadas_for_proyecto(
  p_tenant_id uuid,
  p_project_id uuid
)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_open_from_project bigint := 0;
  v_open_from_subprojects bigint := 0;
  v_has_jornadas boolean := false;
  v_has_project_id boolean := false;
  v_has_subproject_id boolean := false;
  v_has_subprojects boolean := false;
  v_has_subproject_tenant boolean := false;
  v_has_subproject_project boolean := false;
  v_has_estado boolean := false;
begin
  if to_regclass('public.jornadas') is null then
    return 0;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'project_id'
  ) into v_has_project_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'subproject_id'
  ) into v_has_subproject_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'tenant_id'
  ) into v_has_jornadas;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'estado'
  ) into v_has_estado;

  select to_regclass('public.subproyectos') is not null
    from information_schema.tables
    into v_has_subprojects
  where table_schema = 'public'
    and table_name = 'subproyectos';

  if v_has_subprojects then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'tenant_id'
    ) into v_has_subproject_tenant;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'proyecto_id'
    ) into v_has_subproject_project;
  end if;

  if not v_has_estado then
    return 0;
  end if;

  if v_has_project_id then
    execute
      'select count(*) from public.jornadas where tenant_id = $1 and project_id = $2 and estado = ''abierta'''
      into v_open_from_project
      using p_tenant_id, p_project_id;
  end if;

  if v_has_subproject_id and v_has_subprojects and v_has_subproject_tenant and v_has_subproject_project then
    execute
      'select count(*)
       from public.jornadas j
       where j.tenant_id = $1
         and j.estado = ''abierta''
         and exists (
           select 1
           from public.subproyectos sp
           where sp.id = j.subproject_id
             and sp.tenant_id = $1
             and sp.proyecto_id = $2
         )'
      into v_open_from_subprojects
      using p_tenant_id, p_project_id;
  end if;

  return coalesce(v_open_from_project, 0) + coalesce(v_open_from_subprojects, 0);
end;
$$;

create or replace function public.invalidate_open_jornadas_for_proyecto(
  p_tenant_id uuid,
  p_project_id uuid,
  p_reason text
)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_total_invalidated bigint := 0;
  v_direct_invalidated bigint := 0;
  v_subproject_invalidated bigint := 0;
  v_reason_column text;
  v_has_project_id boolean := false;
  v_has_subproject_id boolean := false;
  v_has_subprojects boolean := false;
  v_has_subproject_tenant boolean := false;
  v_has_subproject_project boolean := false;
  v_has_estado boolean := false;
  v_sql text;
begin
  if to_regclass('public.jornadas') is null then
    return 0;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'project_id'
  ) into v_has_project_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'subproject_id'
  ) into v_has_subproject_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jornadas'
      and column_name = 'estado'
  ) into v_has_estado;

  select to_regclass('public.subproyectos') is not null
    from information_schema.tables
    into v_has_subprojects
  where table_schema = 'public'
    and table_name = 'subproyectos';

  if v_has_subprojects then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'tenant_id'
    ) into v_has_subproject_tenant;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'proyecto_id'
    ) into v_has_subproject_project;
  end if;

  if not v_has_estado then
    return 0;
  end if;

  select candidate.column_name
    into v_reason_column
  from unnest(
    ARRAY[
      'motivo_anulacion',
      'razon_anulacion',
      'motivo_cancelacion',
      'observaciones_anulacion'
    ]::text[]
  ) as candidate(column_name)
  join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'jornadas'
   and c.column_name = candidate.column_name
  limit 1;

  if v_has_project_id then
    v_sql :=
      'update public.jornadas set estado = ''anulada''' ||
      coalesce(format(', %I = $3', v_reason_column), '') ||
      ' where tenant_id = $1 and estado = ''abierta'' and project_id = $2';

    if v_reason_column is not null then
      execute v_sql using p_tenant_id, p_project_id, p_reason;
    else
      execute v_sql using p_tenant_id, p_project_id;
    end if;

    get diagnostics v_direct_invalidated = row_count;
  end if;

  if v_has_subproject_id and v_has_subprojects and v_has_subproject_tenant and v_has_subproject_project then
    v_sql :=
      'update public.jornadas set estado = ''anulada''' ||
      coalesce(format(', %I = $4', v_reason_column), '') ||
      ' where tenant_id = $1 and estado = ''abierta'' and subproject_id in '
      '(select id from public.subproyectos sp where sp.tenant_id = $1 and sp.proyecto_id = $2)';

    if v_reason_column is not null then
      execute v_sql using p_tenant_id, p_project_id, p_reason, p_reason;
    else
      execute v_sql using p_tenant_id, p_project_id;
    end if;

    get diagnostics v_subproject_invalidated = row_count;
  end if;

  v_total_invalidated := coalesce(v_direct_invalidated, 0) + coalesce(v_subproject_invalidated, 0);
  return v_total_invalidated;
end;
$$;

create or replace function public.create_proyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_nombre text,
  p_cliente_id uuid,
  p_ubicacion text,
  p_fecha_inicio date,
  p_forma_cobro text,
  p_monto_fijo numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_client_estado text;
  v_client_tenant_id uuid;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'projects:create') then
    raise exception 'Actor lacks projects:create capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  select tenant_id, estado
    into v_client_tenant_id, v_client_estado
  from public.clientes
  where id = p_cliente_id
    and tenant_id = p_tenant_id
    and estado = 'activo';

  if v_client_tenant_id is null then
    raise exception 'Referenced client is missing or not active for this tenant';
  end if;

  insert into public.proyectos (
    tenant_id,
    nombre,
    cliente_id,
    ubicacion,
    fecha_inicio,
    forma_cobro,
    monto_fijo,
    estado
  ) values (
    p_tenant_id,
    p_nombre,
    p_cliente_id,
    p_ubicacion,
    p_fecha_inicio,
    p_forma_cobro,
    p_monto_fijo,
    'activo'
  ) returning id into v_project_id;

  return v_project_id;
end;
$$;

create or replace function public.update_proyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_nombre text,
  p_cliente_id uuid,
  p_ubicacion text,
  p_fecha_inicio date,
  p_forma_cobro text,
  p_monto_fijo numeric default null,
  p_fecha_finalizacion date default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
  v_client_tenant_id uuid;
  v_client_estado text;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'projects:update') then
    raise exception 'Actor lacks projects:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_project_id::text, true);

  select tenant_id, estado
    into v_client_tenant_id, v_client_estado
  from public.clientes
  where id = p_cliente_id
    and tenant_id = p_tenant_id
    and estado = 'activo';

  if v_client_tenant_id is null then
    raise exception 'Referenced client is missing or not active for this tenant';
  end if;

  update public.proyectos
  set nombre = p_nombre,
      cliente_id = p_cliente_id,
      ubicacion = p_ubicacion,
      fecha_inicio = p_fecha_inicio,
      fecha_finalizacion = coalesce(p_fecha_finalizacion, fecha_finalizacion),
      forma_cobro = p_forma_cobro,
      monto_fijo = p_monto_fijo
  where tenant_id = p_tenant_id
    and id = p_project_id
    and estado <> 'oculto';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.pause_proyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_force boolean default false,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
  v_open_jornadas bigint;
  v_current_estado text;
  v_invalidated bigint := 0;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'projects:pause') then
    raise exception 'Actor lacks projects:pause capability' using errcode = '42501';
  end if;

  select estado into v_current_estado
  from public.proyectos
  where tenant_id = p_tenant_id
    and id = p_project_id;

  if v_current_estado is null then
    return false;
  end if;

  if v_current_estado <> 'activo' then
    raise exception 'Cannot pause a project that is not active';
  end if;

  v_open_jornadas := public.count_open_jornadas_for_proyecto(p_tenant_id, p_project_id);

  if v_open_jornadas > 0 then
    if not p_force then
      raise exception 'Project has % open jornadas. Use force=true to proceed.', v_open_jornadas;
    end if;

    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Forced pause requires a reason';
    end if;

    v_invalidated := public.invalidate_open_jornadas_for_proyecto(
      p_tenant_id,
      p_project_id,
      p_reason
    );
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_project_id::text, true);

  update public.proyectos
  set estado = 'pausado'
  where tenant_id = p_tenant_id
    and id = p_project_id
    and estado = 'activo';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.finish_proyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_force bool default false,
  p_reason text default null,
  p_close_assignments bool default true
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
  v_current_estado text;
  v_open_jornadas bigint;
  v_closed_count int := 0;
  v_has_subprojects boolean := false;
  v_has_subproject_tenant boolean := false;
  v_has_subproject_project boolean := false;
  v_has_subproject_estado boolean := false;
  v_has_subproject_finished_at boolean := false;
  v_sql text;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'projects:finish') then
    raise exception 'Actor lacks projects:finish capability' using errcode = '42501';
  end if;

  select estado into v_current_estado
  from public.proyectos
  where tenant_id = p_tenant_id
    and id = p_project_id;

  if v_current_estado is null then
    return -1;
  end if;

  if v_current_estado not in ('activo', 'pausado') then
    raise exception 'Cannot finish a project that is not active or paused';
  end if;

  v_open_jornadas := public.count_open_jornadas_for_proyecto(p_tenant_id, p_project_id);

  if v_open_jornadas > 0 then
    if not p_force then
      raise exception 'Project has % open jornadas. Use force=true to proceed.', v_open_jornadas;
    end if;

    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Forced finish requires a reason';
    end if;

    perform public.invalidate_open_jornadas_for_proyecto(
      p_tenant_id,
      p_project_id,
      p_reason
    );
  end if;

  -- Close active machine assignments when flag is enabled.
  if p_close_assignments then
    v_closed_count := public.close_assignments_for_project(
      p_tenant_id,
      p_project_id
    );
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_project_id::text, true);

  select to_regclass('public.subproyectos') is not null
    from information_schema.tables
    into v_has_subprojects
  where table_schema = 'public'
    and table_name = 'subproyectos';

  if v_has_subprojects then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'tenant_id'
    ) into v_has_subproject_tenant;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'proyecto_id'
    ) into v_has_subproject_project;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'estado'
    ) into v_has_subproject_estado;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'subproyectos'
        and column_name = 'fecha_finalizacion'
    ) into v_has_subproject_finished_at;
  end if;

  if v_has_subprojects and v_has_subproject_tenant and v_has_subproject_project and v_has_subproject_estado then
    v_sql :=
      'update public.subproyectos set estado = ''finalizado''' ||
      case
        when v_has_subproject_finished_at then ', fecha_finalizacion = coalesce(fecha_finalizacion, current_date)'
        else ''
      end ||
      ' where tenant_id = $1 and proyecto_id = $2 and estado in (''activo'', ''pausado'')';

    execute v_sql using p_tenant_id, p_project_id;
  end if;

  update public.proyectos
  set
    estado = 'finalizado',
    fecha_finalizacion = coalesce(fecha_finalizacion, current_date)
  where tenant_id = p_tenant_id
    and id = p_project_id
    and estado in ('activo', 'pausado');

  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then
    return -1;
  end if;

  return v_closed_count;
end;
$$;

create or replace function public.reopen_proyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_target_estado text default 'activo'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
  v_current_estado text;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'projects:reopen') then
    raise exception 'Actor lacks projects:reopen capability' using errcode = '42501';
  end if;

  if p_target_estado not in ('activo', 'pausado') then
    raise exception 'Reopen target state must be activo or pausado';
  end if;

  select estado into v_current_estado
  from public.proyectos
  where tenant_id = p_tenant_id
    and id = p_project_id;

  if v_current_estado is null then
    return false;
  end if;

  if v_current_estado <> 'finalizado' then
    raise exception 'Cannot reopen a non-finalized project';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_project_id::text, true);

  update public.proyectos
  set estado = p_target_estado
  where tenant_id = p_tenant_id
    and id = p_project_id
    and estado = 'finalizado';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.hide_proyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'projects:hide') then
    raise exception 'Actor lacks projects:hide capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_project_id::text, true);

  update public.proyectos
  set estado = 'oculto'
  where tenant_id = p_tenant_id
    and id = p_project_id
    and estado <> 'oculto';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- Execute restricted to service_role only.
revoke execute on function public.count_open_jornadas_for_proyecto(uuid, uuid) from public;
revoke execute on function public.invalidate_open_jornadas_for_proyecto(uuid, uuid, text) from public;
revoke execute on function public.create_proyecto(uuid, text, uuid, text, uuid, text, date, text, numeric) from public;
revoke execute on function public.update_proyecto(uuid, text, uuid, uuid, text, uuid, text, date, text, numeric, date) from public;
revoke execute on function public.pause_proyecto(uuid, text, uuid, uuid, boolean, text) from public;
revoke execute on function public.finish_proyecto(uuid, text, uuid, uuid, boolean, text, boolean) from public;
revoke execute on function public.reopen_proyecto(uuid, text, uuid, uuid, text) from public;
revoke execute on function public.hide_proyecto(uuid, text, uuid, uuid) from public;
revoke execute on function public.count_open_jornadas_for_proyecto(uuid, uuid) from anon, authenticated;
revoke execute on function public.invalidate_open_jornadas_for_proyecto(uuid, uuid, text) from anon, authenticated;
revoke execute on function public.create_proyecto(uuid, text, uuid, text, uuid, text, date, text, numeric) from anon, authenticated;
revoke execute on function public.update_proyecto(uuid, text, uuid, uuid, text, uuid, text, date, text, numeric, date) from anon, authenticated;
revoke execute on function public.pause_proyecto(uuid, text, uuid, uuid, boolean, text) from anon, authenticated;
revoke execute on function public.finish_proyecto(uuid, text, uuid, uuid, boolean, text, boolean) from anon, authenticated;
revoke execute on function public.reopen_proyecto(uuid, text, uuid, uuid, text) from anon, authenticated;
revoke execute on function public.hide_proyecto(uuid, text, uuid, uuid) from anon, authenticated;
grant execute on function public.count_open_jornadas_for_proyecto(uuid, uuid) to service_role;
grant execute on function public.invalidate_open_jornadas_for_proyecto(uuid, uuid, text) to service_role;
grant execute on function public.create_proyecto(uuid, text, uuid, text, uuid, text, date, text, numeric) to service_role;
grant execute on function public.update_proyecto(uuid, text, uuid, uuid, text, uuid, text, date, text, numeric, date) to service_role;
grant execute on function public.pause_proyecto(uuid, text, uuid, uuid, boolean, text) to service_role;
grant execute on function public.finish_proyecto(uuid, text, uuid, uuid, boolean, text, boolean) to service_role;
grant execute on function public.reopen_proyecto(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.hide_proyecto(uuid, text, uuid, uuid) to service_role;

create or replace function public.audit_proyectos_trigger()
returns trigger
language plpgsql
as $$
declare
  _actor_id uuid := nullif(current_setting('app.current_actor_id', true), '')::uuid;
  _source text := coalesce(nullif(current_setting('app.audit_source', true), ''), 'system');
  _target_id uuid := null;
  _action text;
  _old_value jsonb := null;
  _new_value jsonb := null;
begin
  _action := 'proyecto.' ||
    case TG_OP
      when 'INSERT' then 'create'
      when 'UPDATE' then 'update'
      when 'DELETE' then 'delete'
    end;

  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(key, value)
      into _old_value
    from jsonb_each(to_jsonb(OLD))
    where to_jsonb(NEW) -> key is distinct from to_jsonb(OLD) -> key;

    select jsonb_object_agg(key, value)
      into _new_value
    from jsonb_each(to_jsonb(NEW))
    where to_jsonb(NEW) -> key is distinct from to_jsonb(OLD) -> key;
  elsif TG_OP = 'INSERT' then
    _new_value := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    _old_value := to_jsonb(OLD);
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
    coalesce(NEW.tenant_id, OLD.tenant_id),
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
    return OLD;
  end if;

  return NEW;
end;
$$;

drop trigger if exists audit_proyectos_trigger on public.proyectos;

create trigger audit_proyectos_trigger
  after insert or update or delete on public.proyectos
  for each row
  execute function public.audit_proyectos_trigger();
