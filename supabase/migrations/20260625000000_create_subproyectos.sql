-- Tenant-scoped subproject catalog.
-- Subprojects inherit ubicacion/forma_cobro from parent project when omitted.

create table public.subproyectos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  proyecto_id uuid not null references proyectos(id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  ubicacion text,
  forma_cobro text check (forma_cobro in ('monto_fijo', 'por_horas', 'por_dia')),
  monto_fijo numeric,
  estado text not null default 'activo' check (estado in ('activo', 'pausado', 'finalizado', 'oculto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subproyectos_monto_fijo_for_monto_fijo_forma check (
    forma_cobro <> 'monto_fijo' or (monto_fijo is not null and monto_fijo > 0)
  )
);

-- Same-tenant FK validation trigger.
create or replace function public.validate_subproyecto_proyecto_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.proyectos p
    where p.id = new.proyecto_id
      and p.tenant_id = new.tenant_id
  ) then
    raise exception 'Referenced project must belong to the same tenant' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger subproyecto_proyecto_tenant_trigger
  before insert or update of tenant_id, proyecto_id on public.subproyectos
  for each row
  execute function public.validate_subproyecto_proyecto_tenant();

-- Indexes.
create index idx_subproyectos_tenant_id on public.subproyectos (tenant_id);
create index idx_subproyectos_tenant_proyecto_id on public.subproyectos (tenant_id, proyecto_id);
create index idx_subproyectos_tenant_estado on public.subproyectos (tenant_id, estado);

-- Unique non-hidden name per tenant (mirrors proyectos pattern).
create unique index uq_subproyectos_tenant_active_nombre
  on public.subproyectos (tenant_id, lower(trim(nombre)))
  where estado <> 'oculto';

-- Updated-at trigger.
drop trigger if exists subproyectos_updated_at on public.subproyectos;

create trigger subproyectos_updated_at
  before update on public.subproyectos
  for each row
  execute function set_updated_at();

-- RLS.
alter table public.subproyectos enable row level security;

create policy "subproyectos tenant isolation - SELECT"
  on public.subproyectos
  for select
  to authenticated
  using (
    tenant_id = public.current_app_tenant_id()
    and estado <> 'oculto'
    and public.current_app_user_has_capability('subprojects:read')
  );

create policy "subproyectos tenant isolation - INSERT"
  on public.subproyectos
  for insert
  to authenticated
  with check (false);

create policy "subproyectos tenant isolation - UPDATE"
  on public.subproyectos
  for update
  to authenticated
  using (false)
  with check (false);

create policy "subproyectos tenant isolation - DELETE deny"
  on public.subproyectos
  for delete
  to authenticated
  using (false);

-- RPC: create_subproyecto
-- Inherits ubicacion and forma_cobro from parent project when omitted.
create or replace function public.create_subproyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_proyecto_id uuid,
  p_nombre text,
  p_ubicacion text default null,
  p_forma_cobro text default null,
  p_monto_fijo numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subproject_id uuid;
  v_parent_ubicacion text;
  v_parent_forma_cobro text;
  v_parent_estado text;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'subprojects:create') then
    raise exception 'Actor lacks subprojects:create capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  -- Resolve parent project fields for inheritance.
  select ubicacion, forma_cobro, estado
    into v_parent_ubicacion, v_parent_forma_cobro, v_parent_estado
  from public.proyectos
  where id = p_proyecto_id
    and tenant_id = p_tenant_id;

  if v_parent_ubicacion is null then
    raise exception 'Referenced project does not exist for this tenant';
  end if;

  if v_parent_estado = 'finalizado' then
    raise exception 'Cannot create subprojects under a finalized project';
  end if;

  insert into public.subproyectos (
    tenant_id,
    proyecto_id,
    nombre,
    ubicacion,
    forma_cobro,
    monto_fijo,
    estado
  ) values (
    p_tenant_id,
    p_proyecto_id,
    p_nombre,
    coalesce(p_ubicacion, v_parent_ubicacion),
    coalesce(p_forma_cobro, v_parent_forma_cobro),
    p_monto_fijo,
    'activo'
  ) returning id into v_subproject_id;

  return v_subproject_id;
end;
$$;

-- RPC: update_subproyecto
create or replace function public.update_subproyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_subproject_id uuid,
  p_nombre text,
  p_ubicacion text default null,
  p_forma_cobro text default null,
  p_monto_fijo numeric default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'subprojects:update') then
    raise exception 'Actor lacks subprojects:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_subproject_id::text, true);

  update public.subproyectos
  set nombre = p_nombre,
      ubicacion = p_ubicacion,
      forma_cobro = p_forma_cobro,
      monto_fijo = p_monto_fijo
  where tenant_id = p_tenant_id
    and id = p_subproject_id
    and estado <> 'oculto';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- RPC: finish_subproyecto
create or replace function public.finish_subproyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_subproject_id uuid,
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
  v_current_estado text;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'subprojects:finish') then
    raise exception 'Actor lacks subprojects:finish capability' using errcode = '42501';
  end if;

  select estado into v_current_estado
  from public.subproyectos
  where tenant_id = p_tenant_id
    and id = p_subproject_id;

  if v_current_estado is null then
    return false;
  end if;

  if v_current_estado not in ('activo', 'pausado') then
    raise exception 'Cannot finish a subproject that is not active or paused';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_subproject_id::text, true);

  update public.subproyectos
  set estado = 'finalizado'
  where tenant_id = p_tenant_id
    and id = p_subproject_id
    and estado in ('activo', 'pausado');

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- RPC: reopen_subproyecto
-- Checks parent project is NOT finalized before allowing reopen.
create or replace function public.reopen_subproyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_subproject_id uuid,
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
  v_parent_estado text;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'subprojects:reopen') then
    raise exception 'Actor lacks subprojects:reopen capability' using errcode = '42501';
  end if;

  if p_target_estado not in ('activo', 'pausado') then
    raise exception 'Reopen target state must be activo or pausado';
  end if;

  select sp.estado, p.estado
    into v_current_estado, v_parent_estado
  from public.subproyectos sp
  join public.proyectos p on p.id = sp.proyecto_id and p.tenant_id = sp.tenant_id
  where sp.tenant_id = p_tenant_id
    and sp.id = p_subproject_id;

  if v_current_estado is null then
    return false;
  end if;

  if v_current_estado <> 'finalizado' then
    raise exception 'Cannot reopen a non-finalized subproject';
  end if;

  if v_parent_estado = 'finalizado' then
    raise exception 'Cannot reopen subproject when parent project is finalized';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_subproject_id::text, true);

  update public.subproyectos
  set estado = p_target_estado
  where tenant_id = p_tenant_id
    and id = p_subproject_id
    and estado = 'finalizado';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- RPC: hide_subproyecto
create or replace function public.hide_subproyecto(
  p_actor_id uuid,
  p_audit_source text,
  p_tenant_id uuid,
  p_subproject_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'subprojects:hide') then
    raise exception 'Actor lacks subprojects:hide capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', p_subproject_id::text, true);

  update public.subproyectos
  set estado = 'oculto'
  where tenant_id = p_tenant_id
    and id = p_subproject_id
    and estado <> 'oculto';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- Grants: execute restricted to service_role only.
revoke execute on function public.create_subproyecto(uuid, text, uuid, uuid, text, text, text, numeric) from public;
revoke execute on function public.update_subproyecto(uuid, text, uuid, uuid, text, text, text, numeric) from public;
revoke execute on function public.finish_subproyecto(uuid, text, uuid, uuid, boolean, text) from public;
revoke execute on function public.reopen_subproyecto(uuid, text, uuid, uuid, text) from public;
revoke execute on function public.hide_subproyecto(uuid, text, uuid, uuid) from public;
revoke execute on function public.create_subproyecto(uuid, text, uuid, uuid, text, text, text, numeric) from anon, authenticated;
revoke execute on function public.update_subproyecto(uuid, text, uuid, uuid, text, text, text, numeric) from anon, authenticated;
revoke execute on function public.finish_subproyecto(uuid, text, uuid, uuid, boolean, text) from anon, authenticated;
revoke execute on function public.reopen_subproyecto(uuid, text, uuid, uuid, text) from anon, authenticated;
revoke execute on function public.hide_subproyecto(uuid, text, uuid, uuid) from anon, authenticated;
grant execute on function public.create_subproyecto(uuid, text, uuid, uuid, text, text, text, numeric) to service_role;
grant execute on function public.update_subproyecto(uuid, text, uuid, uuid, text, text, text, numeric) to service_role;
grant execute on function public.finish_subproyecto(uuid, text, uuid, uuid, boolean, text) to service_role;
grant execute on function public.reopen_subproyecto(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.hide_subproyecto(uuid, text, uuid, uuid) to service_role;

-- Audit trigger.
create or replace function public.audit_subproyectos_trigger()
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
  _action := 'subproyecto.' ||
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

drop trigger if exists audit_subproyectos_trigger on public.subproyectos;

create trigger audit_subproyectos_trigger
  after insert or update or delete on public.subproyectos
  for each row
  execute function public.audit_subproyectos_trigger();
