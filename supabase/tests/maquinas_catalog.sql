-- Machine catalog verification for issue #48.
-- Run against local disposable DB:
--   supabase db reset
--   psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/maquinas_catalog.sql

\set ON_ERROR_STOP on
\echo '=== Maquinas Catalog Tests ==='

begin;

insert into tenants (id, name, slug, timezone, currency, status, fuel_unit) values
  ('aaaa4800-0000-0000-0000-000000000001', 'Tenant Machines A', 'tenant-machines-a', 'UTC', 'USD', 'active', 'liters'),
  ('aaaa4800-0000-0000-0000-000000000002', 'Tenant Machines B', 'tenant-machines-b', 'UTC', 'USD', 'active', 'liters');
insert into auth.users (id, email) values
  ('bbbb4800-0000-0000-0000-000000000001', 'machines-admin-a@example.com'), ('bbbb4800-0000-0000-0000-000000000002', 'machines-admin-b@example.com') on conflict (id) do nothing;
insert into user_profiles (id, tenant_id, auth_user_id, email, full_name) values
  ('cccc4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'bbbb4800-0000-0000-0000-000000000001', 'machines-admin-a@example.com', 'Machines Admin A'),
  ('cccc4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'bbbb4800-0000-0000-0000-000000000002', 'machines-admin-b@example.com', 'Machines Admin B');
insert into roles (id, tenant_id, name) values
  ('dddd4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'Machines Reader A'),
  ('dddd4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'Machines Reader B');
insert into role_capabilities (role_id, capability_id)
select r.id, c.id from roles r cross join capabilities c
where r.id in ('dddd4800-0000-0000-0000-000000000001', 'dddd4800-0000-0000-0000-000000000002')
  and c.key in ('machines:read', 'machines:create', 'machines:update', 'machines:change_status')
on conflict do nothing;
insert into user_roles (tenant_id, user_id, role_id) values
  ('aaaa4800-0000-0000-0000-000000000001', 'cccc4800-0000-0000-0000-000000000001', 'dddd4800-0000-0000-0000-000000000001'),
  ('aaaa4800-0000-0000-0000-000000000002', 'cccc4800-0000-0000-0000-000000000002', 'dddd4800-0000-0000-0000-000000000002');

set local role service_role;
insert into public.tipos_combustible (id, tenant_id, nombre, estado) values
  ('eeee4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'Diesel A', 'activo'),
  ('eeee4800-0000-0000-0000-000000000003', 'aaaa4800-0000-0000-0000-000000000001', 'Hidden A', 'oculto'),
  ('eeee4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'Diesel B', 'activo') on conflict (id) do nothing;
insert into public.maquinas (id, tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, capacidad_transporte_m3, tarifa_sugerida, estado) values
  ('ffff4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'MAQ-001', 'AAA001', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 120, 'exacto', 60, null, 150, 'activa'),
  ('ffff4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000001', 'MAQ-002', 'AAA002', 'acarreo', 'eeee4800-0000-0000-0000-000000000001', 200, 'aproximado_porcentaje', 40, 12.5, null, 'oculta'),
  ('ffff4800-0000-0000-0000-000000000003', 'aaaa4800-0000-0000-0000-000000000002', 'MAQ-001', 'BBB001', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000002', 110, 'sin_medicion', null, null, null, 'activa');

\echo 'Test 1: RLS isolates tenant and excludes oculta rows from authenticated reads'
savepoint maquinas_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb4800-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa4800-0000-0000-0000-000000000001"}}';
do $$ declare v_visible int; v_cross_tenant int; begin
  select count(*) into v_visible from public.maquinas;
  select count(*) into v_cross_tenant from public.maquinas where tenant_id = 'aaaa4800-0000-0000-0000-000000000002';
  if v_visible <> 1 then raise exception 'FAIL: expected 1 visible tenant A machine, got %', v_visible; end if;
  if v_cross_tenant <> 0 then raise exception 'FAIL: tenant A saw % tenant B machines', v_cross_tenant; end if;
end $$;
rollback to savepoint maquinas_test1;

\echo 'Test 2: codigo is lifetime-unique per tenant but reusable across tenants'
savepoint maquinas_test2;
set local role service_role;
do $$ declare v_cross_tenant_machine_id uuid; begin
  begin
    insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
    values ('aaaa4800-0000-0000-0000-000000000001', '  maq-002  ', 'AAA999', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 130, 'sin_medicion', null, 'activa');
    raise exception 'FAIL: duplicate tenant-local codigo was accepted after hide';
  exception when unique_violation then raise notice 'PASS: duplicate tenant-local codigo rejected even when prior row is oculta'; end;
  insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
  values ('aaaa4800-0000-0000-0000-000000000002', 'MAQ-002', 'BBB999', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000002', 95, 'sin_medicion', null, 'activa') returning id into v_cross_tenant_machine_id;
  if v_cross_tenant_machine_id is null then raise exception 'FAIL: expected cross-tenant duplicate codigo insert to succeed'; end if;
end $$;
rollback to savepoint maquinas_test2;

\echo 'Test 3: fuel type FK cannot cross tenants'
savepoint maquinas_test3;
set local role service_role;
do $$ begin
  begin
    insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
    values ('aaaa4800-0000-0000-0000-000000000001', 'MAQ-XTENANT', 'AAA777', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000002', 100, 'exacto', 50, 'activa');
    raise exception 'FAIL: cross-tenant fuel type was accepted';
  exception when check_violation then
    if position('Referenced fuel type must belong to the same tenant' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: cross-tenant fuel type rejected';
  end;
end $$;
rollback to savepoint maquinas_test3;

\echo 'Test 4: hidden fuel types are rejected on create and on fuel-type changes, but unchanged hidden selections remain valid'
savepoint maquinas_test4;
set local role service_role;
do $$
declare
  v_machine_id uuid;
  v_update_ok boolean;
begin
  begin
    insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
    values ('aaaa4800-0000-0000-0000-000000000001', 'MAQ-HIDDEN-CREATE', 'AAA555', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000003', 100, 'exacto', 50, 'activa');
    raise exception 'FAIL: hidden fuel type was accepted on machine create';
  exception when check_violation then
    if position('active fuel type' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: hidden fuel type rejected on create';
  end;

  insert into public.tipos_combustible (id, tenant_id, nombre, estado) values
    ('eeee4800-0000-0000-0000-000000000004', 'aaaa4800-0000-0000-0000-000000000001', 'Diesel Legacy', 'activo');

  insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
  values ('aaaa4800-0000-0000-0000-000000000001', 'MAQ-HIDDEN-KEEP', 'AAA556', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000004', 100, 'exacto', 50, 'activa')
  returning id into v_machine_id;

  update public.tipos_combustible
    set estado = 'oculto'
  where id = 'eeee4800-0000-0000-0000-000000000004';

  update public.maquinas
    set placa = 'AAA557'
  where id = v_machine_id;

  v_update_ok := public.update_maquina(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    v_machine_id,
    'MAQ-HIDDEN-KEEP',
    'AAA558',
    'por_tiempo',
    'eeee4800-0000-0000-0000-000000000004',
    100,
    'exacto',
    50,
    null,
    null
  );

  if not v_update_ok then
    raise exception 'FAIL: unchanged hidden fuel selection should remain valid on update';
  end if;

  begin
    perform public.update_maquina(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000001',
      'MAQ-001',
      'AAA001',
      'por_tiempo',
      'eeee4800-0000-0000-0000-000000000003',
      120,
      'exacto',
      60,
      null,
      150
    );
    raise exception 'FAIL: switching a machine to a hidden fuel type was accepted';
  exception when check_violation then
    if position('active fuel type' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: switching to a hidden fuel type is rejected';
  end;
end $$;
rollback to savepoint maquinas_test4;

\echo 'Test 5: exacto and aproximado_porcentaje require non-null nivel_inicial_combustible'
savepoint maquinas_test5;
set local role service_role;
do $$
begin
  begin
    insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
    values ('aaaa4800-0000-0000-0000-000000000001', 'MAQ-NULO-EXACTO', 'AAA600', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 100, 'exacto', null, 'activa');
    raise exception 'FAIL: exacto accepted null initial fuel level';
  exception when check_violation then
    raise notice 'PASS: exacto rejects null initial fuel level';
  end;

  begin
    insert into public.maquinas (tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, estado)
    values ('aaaa4800-0000-0000-0000-000000000001', 'MAQ-NULO-APROX', 'AAA601', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 100, 'aproximado_porcentaje', null, 'activa');
    raise exception 'FAIL: aproximado_porcentaje accepted null initial fuel level';
  exception when check_violation then
    raise notice 'PASS: aproximado_porcentaje rejects null initial fuel level';
  end;
end $$;
rollback to savepoint maquinas_test5;

\echo 'Test 6: hidden machines cannot be reactivated through status RPC'
savepoint maquinas_test6;
set local role service_role;
do $$
begin
  begin
    perform public.change_maquina_estado(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000002',
      'activa'
    );
    raise exception 'FAIL: hidden machine was allowed to change status';
  exception when check_violation then
    if position('Hidden machines cannot change status' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS: hidden machine status changes are rejected';
  end;
end $$;
rollback to savepoint maquinas_test6;

\echo 'Test 7: hidden machines cannot be updated through update_maquina RPC'
savepoint maquinas_test7;
set local role service_role;
do $$
declare
  v_updated boolean;
  v_placa text;
begin
  v_updated := public.update_maquina(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000002',
    'MAQ-002',
    'AAA777',
    'acarreo',
    'eeee4800-0000-0000-0000-000000000001',
    200,
    'aproximado_porcentaje',
    40,
    12.5,
    null
  );

  if v_updated then
    raise exception 'FAIL: hidden machine was allowed to update through update_maquina';
  end if;

  select placa into v_placa
  from public.maquinas
  where id = 'ffff4800-0000-0000-0000-000000000002';

  if v_placa <> 'AAA002' then
    raise exception 'FAIL: hidden machine changed placa during blocked update (got %)', v_placa;
  end if;
end $$;
rollback to savepoint maquinas_test7;

\echo 'Test 8: create_maquina writes audit log context'
savepoint maquinas_test8;
set local role service_role;
do $$
declare
  v_machine_id uuid;
  v_action text;
  v_source text;
  v_actor uuid;
begin
  v_machine_id := public.create_maquina(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'MAQ-AUDIT-CREATE',
    'AAA700',
    'por_tiempo',
    'eeee4800-0000-0000-0000-000000000001',
    100,
    'exacto',
    50,
    null,
    150
  );

  select action, source, actor_user_id
    into v_action, v_source, v_actor
  from public.audit_log
  where tenant_id = 'aaaa4800-0000-0000-0000-000000000001'
    and action = 'maquina.create'
    and new_value->>'id' = v_machine_id::text
  order by occurred_at desc
  limit 1;

  if v_action <> 'maquina.create' or v_source <> 'test-suite' or v_actor <> 'cccc4800-0000-0000-0000-000000000001' then
    raise exception 'FAIL: create_maquina audit row mismatch (action %, source %, actor %)', v_action, v_source, v_actor;
  end if;
end $$;
rollback to savepoint maquinas_test8;

\echo 'Test 9: update_maquina writes audit log diff'
savepoint maquinas_test9;
set local role service_role;
do $$
declare
  v_updated boolean;
  v_old_placa text;
  v_new_placa text;
begin
  v_updated := public.update_maquina(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'MAQ-001',
    'AAA009',
    'por_tiempo',
    'eeee4800-0000-0000-0000-000000000001',
    120,
    'exacto',
    60,
    null,
    150
  );

  if not v_updated then
    raise exception 'FAIL: update_maquina returned false for existing machine';
  end if;

  select old_value->>'placa', new_value->>'placa'
    into v_old_placa, v_new_placa
  from public.audit_log
  where tenant_id = 'aaaa4800-0000-0000-0000-000000000001'
    and action = 'maquina.update'
    and source = 'test-suite'
    and old_value ? 'placa'
    and new_value ? 'placa'
  order by occurred_at desc
  limit 1;

  if v_old_placa <> 'AAA001' or v_new_placa <> 'AAA009' then
    raise exception 'FAIL: update_maquina audit diff mismatch (old %, new %)', v_old_placa, v_new_placa;
  end if;
end $$;
rollback to savepoint maquinas_test9;

\echo 'Test 10: change_maquina_estado writes audit log diff'
savepoint maquinas_test10;
set local role service_role;
do $$
declare
  v_updated boolean;
  v_old_estado text;
  v_new_estado text;
begin
  v_updated := public.change_maquina_estado(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'en_mantenimiento'
  );

  if not v_updated then
    raise exception 'FAIL: change_maquina_estado returned false for existing machine';
  end if;

  select old_value->>'estado', new_value->>'estado'
    into v_old_estado, v_new_estado
  from public.audit_log
  where tenant_id = 'aaaa4800-0000-0000-0000-000000000001'
    and action = 'maquina.update'
    and source = 'test-suite'
    and old_value ? 'estado'
    and new_value ? 'estado'
  order by occurred_at desc
  limit 1;

  if v_old_estado <> 'activa' or v_new_estado <> 'en_mantenimiento' then
    raise exception 'FAIL: change_maquina_estado audit diff mismatch (old %, new %)', v_old_estado, v_new_estado;
  end if;
end $$;
rollback to savepoint maquinas_test10;

\echo 'All maquinas catalog checks passed.';
rollback;
