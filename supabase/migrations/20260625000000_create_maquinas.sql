-- Tenant-scoped machine catalog.

create table if not exists public.maquinas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  codigo text not null check (length(trim(codigo)) > 0),
  placa text check (placa is null or length(trim(placa)) > 0),
  tipo text not null check (tipo in ('acarreo', 'por_tiempo')),
  tipo_combustible_id uuid not null references public.tipos_combustible(id) on delete restrict,
  tamanio_tanque numeric not null check (tamanio_tanque > 0),
  modo_medicion_combustible text not null check (modo_medicion_combustible in ('exacto', 'aproximado_porcentaje', 'sin_medicion')),
  nivel_inicial_combustible numeric,
  capacidad_transporte_m3 numeric,
  tarifa_sugerida numeric,
  estado text not null default 'activa' check (estado in ('activa', 'en_mantenimiento', 'fuera_de_servicio', 'oculta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maquinas_capacidad_transporte_tipo_check check (tipo = 'acarreo' or capacidad_transporte_m3 is null),
  constraint maquinas_capacidad_transporte_positive_check check (capacidad_transporte_m3 is null or capacidad_transporte_m3 > 0),
  constraint maquinas_tarifa_sugerida_positive_check check (tarifa_sugerida is null or tarifa_sugerida > 0),
  constraint maquinas_nivel_inicial_por_modo_check check (
    (modo_medicion_combustible = 'sin_medicion' and nivel_inicial_combustible is null)
    or (modo_medicion_combustible = 'aproximado_porcentaje' and nivel_inicial_combustible is not null and nivel_inicial_combustible between 0 and 100)
    or (modo_medicion_combustible = 'exacto' and nivel_inicial_combustible is not null and nivel_inicial_combustible between 0 and tamanio_tanque)
  )
);

create or replace function public.validate_maquina_fuel_type_tenant() returns trigger language plpgsql set search_path = public as $$
declare
  v_fuel_type_status text;
begin
  select tc.estado
    into v_fuel_type_status
  from public.tipos_combustible tc
  where tc.id = new.tipo_combustible_id and tc.tenant_id = new.tenant_id;

  if v_fuel_type_status is null then
    raise exception 'Referenced fuel type must belong to the same tenant' using errcode = '23514';
  end if;

  if TG_OP = 'INSERT' or new.tipo_combustible_id is distinct from old.tipo_combustible_id then
    if v_fuel_type_status <> 'activo' then
      raise exception 'Referenced fuel type must be an active fuel type' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists maquinas_tipo_combustible_tenant_trigger on public.maquinas;
create trigger maquinas_tipo_combustible_tenant_trigger before insert or update of tenant_id, tipo_combustible_id on public.maquinas for each row execute function public.validate_maquina_fuel_type_tenant();

create index if not exists idx_maquinas_tenant_id on public.maquinas (tenant_id);
create index if not exists idx_maquinas_tenant_estado on public.maquinas (tenant_id, estado);
create index if not exists idx_maquinas_tenant_tipo_combustible_id on public.maquinas (tenant_id, tipo_combustible_id);
create unique index if not exists uq_maquinas_tenant_codigo on public.maquinas (tenant_id, lower(trim(codigo)));

drop trigger if exists maquinas_updated_at on public.maquinas;
create trigger maquinas_updated_at before update on public.maquinas for each row execute function public.set_updated_at();

alter table public.maquinas enable row level security;

create policy "maquinas tenant isolation - SELECT" on public.maquinas for select to authenticated using (
  tenant_id = public.current_app_tenant_id() and estado <> 'oculta' and public.current_app_user_has_capability('machines:read')
);
create policy "maquinas tenant isolation - INSERT" on public.maquinas for insert to authenticated with check (false);
create policy "maquinas tenant isolation - UPDATE" on public.maquinas for update to authenticated using (false) with check (false);
create policy "maquinas tenant isolation - DELETE deny" on public.maquinas for delete to authenticated using (false);

create or replace function public.create_maquina(
  p_actor_id uuid, p_audit_source text, p_tenant_id uuid, p_codigo text, p_placa text default null,
  p_tipo text default 'por_tiempo', p_tipo_combustible_id uuid default null, p_tamanio_tanque numeric default null,
  p_modo_medicion_combustible text default 'sin_medicion', p_nivel_inicial_combustible numeric default null,
  p_capacidad_transporte_m3 numeric default null, p_tarifa_sugerida numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_machine_id uuid;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'machines:create') then
    raise exception 'Actor lacks machines:create capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, capacidad_transporte_m3, tarifa_sugerida, estado)
  values (p_tenant_id, p_codigo, p_placa, p_tipo, p_tipo_combustible_id, p_tamanio_tanque, p_modo_medicion_combustible, p_nivel_inicial_combustible, p_capacidad_transporte_m3, p_tarifa_sugerida, 'activa')
  returning id into v_machine_id;
  return v_machine_id;
end;
$$;

create or replace function public.update_maquina(
  p_actor_id uuid, p_audit_source text, p_tenant_id uuid, p_machine_id uuid, p_codigo text, p_placa text default null,
  p_tipo text default 'por_tiempo', p_tipo_combustible_id uuid default null, p_tamanio_tanque numeric default null,
  p_modo_medicion_combustible text default 'sin_medicion', p_nivel_inicial_combustible numeric default null,
  p_capacidad_transporte_m3 numeric default null, p_tarifa_sugerida numeric default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'machines:update') then
    raise exception 'Actor lacks machines:update capability' using errcode = '42501';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

   update public.maquinas
      set codigo = p_codigo, placa = p_placa, tipo = p_tipo, tipo_combustible_id = p_tipo_combustible_id,
          tamanio_tanque = p_tamanio_tanque, modo_medicion_combustible = p_modo_medicion_combustible,
          nivel_inicial_combustible = p_nivel_inicial_combustible, capacidad_transporte_m3 = p_capacidad_transporte_m3,
          tarifa_sugerida = p_tarifa_sugerida
    where tenant_id = p_tenant_id and id = p_machine_id and estado <> 'oculta';
  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.change_maquina_estado(
  p_actor_id uuid, p_audit_source text, p_tenant_id uuid, p_machine_id uuid, p_estado text
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_updated_count integer;
begin
  if not public.app_user_has_capability(p_actor_id, p_tenant_id, 'machines:change_status') then
    raise exception 'Actor lacks machines:change_status capability' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.maquinas
    where tenant_id = p_tenant_id
      and id = p_machine_id
      and estado = 'oculta'
  ) then
    raise exception 'Hidden machines cannot change status' using errcode = '23514';
  end if;

  perform set_config('app.current_actor_id', p_actor_id::text, true);
  perform set_config('app.audit_source', p_audit_source, true);
  perform set_config('app.audit_target_id', '', true);

  update public.maquinas
     set estado = p_estado
   where tenant_id = p_tenant_id
     and id = p_machine_id
     and estado <> 'oculta';
  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.audit_maquinas_trigger()
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
  _action := 'maquina.' ||
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

drop trigger if exists audit_maquinas_trigger on public.maquinas;
create trigger audit_maquinas_trigger
  after insert or update or delete on public.maquinas
  for each row
  execute function public.audit_maquinas_trigger();

revoke execute on function public.create_maquina(uuid, text, uuid, text, text, text, uuid, numeric, text, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.update_maquina(uuid, text, uuid, uuid, text, text, text, uuid, numeric, text, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.change_maquina_estado(uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_maquina(uuid, text, uuid, text, text, text, uuid, numeric, text, numeric, numeric, numeric) to service_role;
grant execute on function public.update_maquina(uuid, text, uuid, uuid, text, text, text, uuid, numeric, text, numeric, numeric, numeric) to service_role;
grant execute on function public.change_maquina_estado(uuid, text, uuid, uuid, text) to service_role;
