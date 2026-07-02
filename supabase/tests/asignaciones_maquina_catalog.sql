-- Machine assignment catalog verification for issue #62.
-- Run against local disposable DB:
--   supabase db reset
--   psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/asignaciones_maquina_catalog.sql

\set ON_ERROR_STOP on
\echo '=== Asignaciones Maquina Tests ==='

begin;

-- Seed: tenants
insert into tenants (id, name, slug, timezone, currency, status, fuel_unit) values
  ('aaaa4800-0000-0000-0000-000000000001', 'Tenant Assign A', 'tenant-assign-a', 'UTC', 'USD', 'active', 'liters'),
  ('aaaa4800-0000-0000-0000-000000000002', 'Tenant Assign B', 'tenant-assign-b', 'UTC', 'USD', 'active', 'liters');

-- Seed: auth users
insert into auth.users (id, email) values
  ('bbbb4800-0000-0000-0000-000000000001', 'assign-admin-a@example.com'),
  ('bbbb4800-0000-0000-0000-000000000002', 'assign-admin-b@example.com'),
  ('bbbb4800-0000-0000-0000-000000000003', 'assign-operator-a@example.com'),
  ('bbbb4800-0000-0000-0000-000000000004', 'assign-operator-b@example.com')
on conflict (id) do nothing;

-- Seed: user_profiles
insert into user_profiles (id, tenant_id, auth_user_id, email, full_name) values
  ('cccc4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'bbbb4800-0000-0000-0000-000000000001', 'assign-admin-a@example.com', 'Assign Admin A'),
  ('cccc4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'bbbb4800-0000-0000-0000-000000000002', 'assign-admin-b@example.com', 'Assign Admin B'),
  ('cccc4800-0000-0000-0000-000000000003', 'aaaa4800-0000-0000-0000-000000000001', 'bbbb4800-0000-0000-0000-000000000003', 'assign-operator-a@example.com', 'Assign Operator A'),
  ('cccc4800-0000-0000-0000-000000000004', 'aaaa4800-0000-0000-0000-000000000002', 'bbbb4800-0000-0000-0000-000000000004', 'assign-operator-b@example.com', 'Assign Operator B');

-- Seed: roles with capabilities for assignments
insert into roles (id, tenant_id, name) values
  ('dddd4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'Assign Admin A'),
  ('dddd4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'Assign Admin B'),
  ('dddd4800-0000-0000-0000-000000000003', 'aaaa4800-0000-0000-0000-000000000001', 'operador'),
  ('dddd4800-0000-0000-0000-000000000004', 'aaaa4800-0000-0000-0000-000000000002', 'operador');

insert into role_capabilities (role_id, capability_id)
select r.id, c.id from roles r cross join capabilities c
where r.id in ('dddd4800-0000-0000-0000-000000000001', 'dddd4800-0000-0000-0000-000000000002')
  and c.key in ('assignments:read', 'assignments:create', 'assignments:update', 'assignments:withdraw')
on conflict do nothing;

-- Grant operador role only base capabilities (read only for tests)
insert into role_capabilities (role_id, capability_id)
select r.id, c.id from roles r cross join capabilities c
where r.id in ('dddd4800-0000-0000-0000-000000000003', 'dddd4800-0000-0000-0000-000000000004')
  and c.key in ('assignments:read', 'web.portal.access')
on conflict do nothing;

insert into user_roles (tenant_id, user_id, role_id) values
  ('aaaa4800-0000-0000-0000-000000000001', 'cccc4800-0000-0000-0000-000000000001', 'dddd4800-0000-0000-0000-000000000001'),
  ('aaaa4800-0000-0000-0000-000000000002', 'cccc4800-0000-0000-0000-000000000002', 'dddd4800-0000-0000-0000-000000000002'),
  ('aaaa4800-0000-0000-0000-000000000001', 'cccc4800-0000-0000-0000-000000000003', 'dddd4800-0000-0000-0000-000000000003'),
  ('aaaa4800-0000-0000-0000-000000000002', 'cccc4800-0000-0000-0000-000000000004', 'dddd4800-0000-0000-0000-000000000004');

set local role service_role;

-- Seed: clientes (needed for proyectos FK)
insert into public.clientes (id, tenant_id, nombre, telefono, correo, estado) values
  ('abab4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'Cliente A', '123456789', 'cliente-a@example.com', 'activo'),
  ('abab4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'Cliente B', '987654321', 'cliente-b@example.com', 'activo');

-- Seed: fuel types (needed for maquinas FK)
insert into public.tipos_combustible (id, tenant_id, nombre, estado) values
  ('eeee4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'Diesel A', 'activo'),
  ('eeee4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000002', 'Diesel B', 'activo');

-- Seed: projects
insert into public.proyectos (id, tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, forma_cobro, monto_fijo, estado) values
  ('hhhh4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'Project A Active', 'abab4800-0000-0000-0000-000000000001', 'Location A', '2026-01-01', 'monto_fijo', 50000, 'activo'),
  ('hhhh4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000001', 'Project A Finished', 'abab4800-0000-0000-0000-000000000001', 'Location A2', '2026-01-01', 'monto_fijo', 30000, 'finalizado'),
  ('hhhh4800-0000-0000-0000-000000000003', 'aaaa4800-0000-0000-0000-000000000002', 'Project B Active', 'abab4800-0000-0000-0000-000000000002', 'Location B', '2026-01-01', 'monto_fijo', 40000, 'activo');

-- Seed: machines (mix of por_tiempo and acarreo, active and non-active)
insert into public.maquinas (id, tenant_id, codigo, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, estado) values
  ('ffff4800-0000-0000-0000-000000000001', 'aaaa4800-0000-0000-0000-000000000001', 'MAQ-PT-ACTIVE', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 120, 'sin_medicion', 'activa'),
  ('ffff4800-0000-0000-0000-000000000002', 'aaaa4800-0000-0000-0000-000000000001', 'MAQ-PT-MAINT', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 120, 'sin_medicion', 'en_mantenimiento'),
  ('ffff4800-0000-0000-0000-000000000003', 'aaaa4800-0000-0000-0000-000000000001', 'MAQ-ACARREO', 'acarreo', 'eeee4800-0000-0000-0000-000000000001', 200, 'sin_medicion', 'activa'),
  ('ffff4800-0000-0000-0000-000000000004', 'aaaa4800-0000-0000-0000-000000000002', 'MAQ-B-ACTIVE', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000002', 110, 'sin_medicion', 'activa');

--
-- TEST 1: Tenant isolation — list_asignaciones_activas only returns own tenant
--
\echo 'Test 1: Tenant isolation'
savepoint test1;
set local role service_role;

-- Create an assignment in tenant A
select public.create_asignacion(
  'cccc4800-0000-0000-0000-000000000001',
  'test-suite',
  'aaaa4800-0000-0000-0000-000000000001',
  'ffff4800-0000-0000-0000-000000000001',
  'hhhh4800-0000-0000-0000-000000000001',
  'cccc4800-0000-0000-0000-000000000003',
  150,
  null
) as v_tenant_a_assignment;

-- Create an assignment in tenant B
select public.create_asignacion(
  'cccc4800-0000-0000-0000-000000000002',
  'test-suite',
  'aaaa4800-0000-0000-0000-000000000002',
  'ffff4800-0000-0000-0000-000000000004',
  'hhhh4800-0000-0000-0000-000000000003',
  'cccc4800-0000-0000-0000-000000000004',
  200,
  null
) as v_tenant_b_assignment;

do $$
declare
  v_a_count int;
  v_b_count int;
  v_cross_tenant_count int;
begin
  select count(*) into v_a_count from unnest(public.list_asignaciones_activas('aaaa4800-0000-0000-0000-000000000001'));
  select count(*) into v_b_count from unnest(public.list_asignaciones_activas('aaaa4800-0000-0000-0000-000000000002'));

  if v_a_count <> 1 then raise exception 'FAIL: tenant A expected 1 active assignment, got %', v_a_count; end if;
  if v_b_count <> 1 then raise exception 'FAIL: tenant B expected 1 active assignment, got %', v_b_count; end if;

  -- Verify tenant A cannot see tenant B's assignment through list
  select count(*) into v_cross_tenant_count
  from unnest(public.list_asignaciones_activas('aaaa4800-0000-0000-0000-000000000001')) r
  where (r->>'maquina_codigo') = 'MAQ-B-ACTIVE';

  if v_cross_tenant_count > 0 then
    raise exception 'FAIL: tenant A saw % tenant B assignments in list', v_cross_tenant_count;
  end if;
end $$;

rollback to savepoint test1;

--
-- TEST 2: Unique partial index — cannot create duplicate active assignment
--
\echo 'Test 2: Unique partial index prevents duplicate active assignments'
savepoint test2;
set local role service_role;

select public.create_asignacion(
  'cccc4800-0000-0000-0000-000000000001',
  'test-suite',
  'aaaa4800-0000-0000-0000-000000000001',
  'ffff4800-0000-0000-0000-000000000001',
  'hhhh4800-0000-0000-0000-000000000001',
  'cccc4800-0000-0000-0000-000000000003',
  150,
  null
) as v_first;

do $$
begin
  begin
    perform public.create_asignacion(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000001',
      'hhhh4800-0000-0000-0000-000000000001',
      'cccc4800-0000-0000-0000-000000000003',
      160,
      null
    );
    raise exception 'FAIL: duplicate active assignment was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate active assignment rejected by unique partial index';
  end;
end $$;

rollback to savepoint test2;

--
-- TEST 3: Machine type validation — non por_tiempo rejected
--
\echo 'Test 3: Machine type validation — acarreo rejected'
savepoint test3;
set local role service_role;

do $$
begin
  begin
    perform public.create_asignacion(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000003',
      'hhhh4800-0000-0000-0000-000000000001',
      'cccc4800-0000-0000-0000-000000000003',
      150,
      null
    );
    raise exception 'FAIL: acarreo machine was accepted for assignment';
  exception when sqlstate 'MCH02' then
    raise notice 'PASS: acarreo machine rejected';
  end;
end $$;

rollback to savepoint test3;

--
-- TEST 4: Machine status validation — non-active machines rejected
--
\echo 'Test 4: Machine status validation — en_mantenimiento rejected'
savepoint test4;
set local role service_role;

do $$
begin
  begin
    perform public.create_asignacion(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000002',
      'hhhh4800-0000-0000-0000-000000000001',
      'cccc4800-0000-0000-0000-000000000003',
      150,
      null
    );
    raise exception 'FAIL: en_mantenimiento machine was accepted for assignment';
  exception when sqlstate 'MCH03' then
    raise notice 'PASS: en_mantenimiento machine rejected';
  end;
end $$;

rollback to savepoint test4;

--
-- TEST 5: Project status validation — finished project rejected
--
\echo 'Test 5: Project status validation — finished project rejected'
savepoint test5;
set local role service_role;

do $$
begin
  begin
    perform public.create_asignacion(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000001',
      'hhhh4800-0000-0000-0000-000000000002',
      'cccc4800-0000-0000-0000-000000000003',
      150,
      null
    );
    raise exception 'FAIL: finished project was accepted for assignment';
  exception when sqlstate 'PRJ02' then
    raise notice 'PASS: finished project rejected';
  end;
end $$;

rollback to savepoint test5;

--
-- TEST 6: Operator role validation — non-operador rejected
--
\echo 'Test 6: Operator role validation — admin without operador role rejected'
savepoint test6;
set local role service_role;

do $$
begin
  begin
    perform public.create_asignacion(
      'cccc4800-0000-0000-0000-000000000001',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000001',
      'hhhh4800-0000-0000-0000-000000000001',
      'cccc4800-0000-0000-0000-000000000001',
      150,
      null
    );
    raise exception 'FAIL: non-operador user was accepted as operator';
  exception when sqlstate 'USR01' then
    raise notice 'PASS: non-operador user rejected';
  end;
end $$;

rollback to savepoint test6;

--
-- TEST 7: Capability check — actor without assignments:create gets 42501
--
\echo 'Test 7: Capability check — actor without assignments:create'
savepoint test7;
set local role service_role;

do $$
begin
  begin
    perform public.create_asignacion(
      'cccc4800-0000-0000-0000-000000000003',
      'test-suite',
      'aaaa4800-0000-0000-0000-000000000001',
      'ffff4800-0000-0000-0000-000000000001',
      'hhhh4800-0000-0000-0000-000000000001',
      'cccc4800-0000-0000-0000-000000000003',
      150,
      null
    );
    raise exception 'FAIL: user without assignments:create was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS: user without assignments:create rejected (42501)';
  end;
end $$;

rollback to savepoint test7;

--
-- TEST 8: Audit trigger fires on create
--
\echo 'Test 8: Audit trigger fires on create'
savepoint test8;
set local role service_role;

do $$
declare
  v_assignment_id uuid;
  v_action text;
  v_source text;
  v_actor uuid;
begin
  v_assignment_id := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  select action, source, actor_user_id
    into v_action, v_source, v_actor
  from public.audit_log
  where tenant_id = 'aaaa4800-0000-0000-0000-000000000001'
    and action = 'asignacion.create'
    and new_value->>'id' = v_assignment_id::text
  order by occurred_at desc
  limit 1;

  if v_action <> 'asignacion.create' or v_source <> 'test-suite' or v_actor <> 'cccc4800-0000-0000-0000-000000000001' then
    raise exception 'FAIL: create audit row mismatch (action %, source %, actor %)', v_action, v_source, v_actor;
  end if;
end $$;

rollback to savepoint test8;

--
-- TEST 9: Audit trigger fires on update
--
\echo 'Test 9: Audit trigger fires on update'
savepoint test9;
set local role service_role;

do $$
declare
  v_assignment_id uuid;
  v_updated boolean;
  v_old_estado text;
  v_new_estado text;
begin
  v_assignment_id := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  v_updated := public.update_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    v_assignment_id,
    'retirada_del_proyecto'
  );

  if not v_updated then
    raise exception 'FAIL: update_asignacion returned false';
  end if;

  select old_value->>'estado', new_value->>'estado'
    into v_old_estado, v_new_estado
  from public.audit_log
  where tenant_id = 'aaaa4800-0000-0000-0000-000000000001'
    and action = 'asignacion.update'
    and source = 'test-suite'
  order by occurred_at desc
  limit 1;

  if v_old_estado <> 'activa' or v_new_estado <> 'retirada_del_proyecto' then
    raise exception 'FAIL: update audit diff mismatch (old %, new %)', v_old_estado, v_new_estado;
  end if;
end $$;

rollback to savepoint test9;

--
-- TEST 10: Retiring an assignment sets fecha_fin and allows new assignment on same machine
--
\echo 'Test 10: Retire then reassign — fecha_fin set, unique index allows new'
savepoint test10;
set local role service_role;

do $$
declare
  v_assignment_id1 uuid;
  v_assignment_id2 uuid;
  v_updated boolean;
  v_fecha_fin timestamptz;
begin
  v_assignment_id1 := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  v_updated := public.update_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    v_assignment_id1,
    'cerrada_por_finalizacion'
  );

  if not v_updated then
    raise exception 'FAIL: update_asignacion returned false';
  end if;

  select fecha_fin into v_fecha_fin
  from public.asignaciones_maquina
  where id = v_assignment_id1;

  if v_fecha_fin is null then
    raise exception 'FAIL: fecha_fin not set when closing assignment';
  end if;

  -- Now create a new assignment on the same machine — should succeed
  v_assignment_id2 := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    180,
    null
  );

  if v_assignment_id2 is null then
    raise exception 'FAIL: new assignment was not allowed after retiring previous';
  end if;
end $$;

rollback to savepoint test10;

--
-- TEST 11: Trigger includes id in UPDATE old_value / new_value
--
\echo 'Test 11: Trigger includes id in UPDATE diff'
savepoint test11;
set local role service_role;

do $$
declare
  v_assignment_id uuid;
  v_updated boolean;
  v_old_id text;
  v_new_id text;
  v_old_estado text;
  v_new_estado text;
begin
  v_assignment_id := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  v_updated := public.update_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    v_assignment_id,
    'retirada_del_proyecto'
  );

  if not v_updated then
    raise exception 'FAIL: update_asignacion returned false';
  end if;

  select old_value->>'id', new_value->>'id', old_value->>'estado', new_value->>'estado'
    into v_old_id, v_new_id, v_old_estado, v_new_estado
  from public.audit_log
  where tenant_id = 'aaaa4800-0000-0000-0000-000000000001'
    and action = 'asignacion.update'
    and source = 'test-suite'
    and old_value is not null
  order by occurred_at desc
  limit 1;

  if v_old_id is null or v_old_id <> v_assignment_id::text then
    raise exception 'FAIL: old_value id missing or wrong (got %)', v_old_id;
  end if;
  if v_new_id is null or v_new_id <> v_assignment_id::text then
    raise exception 'FAIL: new_value id missing or wrong (got %)', v_new_id;
  end if;
  if v_old_estado <> 'activa' then
    raise exception 'FAIL: old estado expected activa got %', v_old_estado;
  end if;
  if v_new_estado <> 'retirada_del_proyecto' then
    raise exception 'FAIL: new estado expected retirada_del_proyecto got %', v_new_estado;
  end if;

  raise notice 'PASS: trigger includes id and estado diff in UPDATE';
end $$;

rollback to savepoint test11;

--
-- TEST 12: list_asignacion_historial returns full timeline ordered by time
--
\echo 'Test 12: list_asignacion_historial full timeline'
savepoint test12;
set local role service_role;

do $$
declare
  v_assignment_id uuid;
  v_updated boolean;
  v_history jsonb[];
  v_entry_count int;
  v_latest_action text;
begin
  v_assignment_id := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  -- Small sleep to ensure distinct occurred_at timestamps
  perform pg_sleep(0.1);

  v_updated := public.update_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    v_assignment_id,
    'retirada_del_proyecto'
  );

  if not v_updated then
    raise exception 'FAIL: update_asignacion returned false';
  end if;

  v_history := public.list_asignacion_historial(
    'cccc4800-0000-0000-0000-000000000001',
    'aaaa4800-0000-0000-0000-000000000001',
    v_assignment_id
  );

  v_entry_count := array_length(v_history, 1);
  if v_entry_count <> 2 then
    raise exception 'FAIL: expected 2 history entries, got %', v_entry_count;
  end if;

  -- Most recent entry first (desc order): the update
  v_latest_action := v_history[1]->>'action';
  if v_latest_action <> 'asignacion.update' then
    raise exception 'FAIL: latest entry should be asignacion.update, got %', v_latest_action;
  end if;

  -- Second entry: the create
  if v_history[2]->>'action' <> 'asignacion.create' then
    raise exception 'FAIL: second entry should be asignacion.create, got %', v_history[2]->>'action';
  end if;

  raise notice 'PASS: timeline has 2 entries, ordered occurred_at DESC';
end $$;

rollback to savepoint test12;

--
-- TEST 13: list_asignacion_historial empty for non-existent assignment
--
\echo 'Test 13: list_asignacion_historial empty for non-existent'
savepoint test13;
set local role service_role;

do $$
declare
  v_history jsonb[];
  v_count int;
begin
  v_history := public.list_asignacion_historial(
    'cccc4800-0000-0000-0000-000000000001',
    'aaaa4800-0000-0000-0000-000000000001',
    'deadbeef-0000-0000-0000-000000000000'
  );

  v_count := array_length(v_history, 1);
  if v_count is not null and v_count > 0 then
    raise exception 'FAIL: expected empty array for non-existent assignment, got % entries', v_count;
  end if;

  raise notice 'PASS: non-existent assignment returns empty array';
end $$;

rollback to savepoint test13;

--
-- TEST 14: list_asignacion_historial cross-tenant isolation
--
\echo 'Test 14: list_asignacion_historial cross-tenant isolation'
savepoint test14;
set local role service_role;

do $$
declare
  v_assignment_id uuid;
  v_history jsonb[];
  v_count int;
begin
  -- Create assignment in tenant A
  v_assignment_id := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  -- Query from tenant B using tenant A's assignment id
  v_history := public.list_asignacion_historial(
    'cccc4800-0000-0000-0000-000000000002',
    'aaaa4800-0000-0000-0000-000000000002',
    v_assignment_id
  );

  v_count := coalesce(array_length(v_history, 1), 0);
  if v_count > 0 then
    raise exception 'FAIL: cross-tenant query saw % entries (should be 0)', v_count;
  end if;

  raise notice 'PASS: cross-tenant history query returns empty';
end $$;

rollback to savepoint test14;

--
-- TEST 15: list_asignacion_historial requires assignments:read (42501)
--
\echo 'Test 15: list_asignacion_historial requires assignments:read'
savepoint test15;
set local role service_role;

do $$
declare
  v_assignment_id uuid;
  v_no_capability_id uuid := '99994800-0000-0000-0000-000000000001';
begin
  v_assignment_id := public.create_asignacion(
    'cccc4800-0000-0000-0000-000000000001',
    'test-suite',
    'aaaa4800-0000-0000-0000-000000000001',
    'ffff4800-0000-0000-0000-000000000001',
    'hhhh4800-0000-0000-0000-000000000001',
    'cccc4800-0000-0000-0000-000000000003',
    150,
    null
  );

  begin
    perform public.list_asignacion_historial(
      v_no_capability_id,
      'aaaa4800-0000-0000-0000-000000000001',
      v_assignment_id
    );
    raise exception 'FAIL: user without assignments:read was allowed to query history';
  exception when insufficient_privilege then
    raise notice 'PASS: user without assignments:read rejected (42501)';
  end;

  -- Admin can query
  declare
    v_admin_history jsonb[];
    v_admin_count int;
  begin
    v_admin_history := public.list_asignacion_historial(
      'cccc4800-0000-0000-0000-000000000001',
      'aaaa4800-0000-0000-0000-000000000001',
      v_assignment_id
    );
    v_admin_count := coalesce(array_length(v_admin_history, 1), 0);
    if v_admin_count = 0 then
      raise exception 'FAIL: admin with assignments:read should see history';
    end if;
  end;

  -- Supervisor (operator with assignments:read) can also query
  declare
    v_supervisor_history jsonb[];
    v_supervisor_count int;
  begin
    v_supervisor_history := public.list_asignacion_historial(
      'cccc4800-0000-0000-0000-000000000003',
      'aaaa4800-0000-0000-0000-000000000001',
      v_assignment_id
    );
    v_supervisor_count := coalesce(array_length(v_supervisor_history, 1), 0);
    if v_supervisor_count = 0 then
      raise exception 'FAIL: supervisor with assignments:read should see history';
    end if;
  end;

  raise notice 'PASS: capability check enforces assignments:read';
end $$;

rollback to savepoint test15;

--
-- TEST 16: list_asignaciones_activas with p_proyecto_id filter
--
\echo 'Test 16: list_asignaciones_activas with p_proyecto_id'
savepoint test16;
set local role service_role;

do $$
declare
  v_project_a uuid := 'hhhh4800-0000-0000-0000-000000000001';
  v_project_extra uuid := 'hhhh4800-0000-0000-0000-000000000009';
  v_tenant_a uuid := 'aaaa4800-0000-0000-0000-000000000001';
  v_admin_a uuid := 'cccc4800-0000-0000-0000-000000000001';
  v_operator_a uuid := 'cccc4800-0000-0000-0000-000000000003';
  v_machine_a uuid := 'ffff4800-0000-0000-0000-000000000001';
  v_count int;
begin
  -- Create a second active project in tenant A
  insert into public.proyectos (id, tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, forma_cobro, monto_fijo, estado)
  values (v_project_extra, v_tenant_a, 'Project A Extra', 'abab4800-0000-0000-0000-000000000001', 'Location Extra', '2026-01-01', 'monto_fijo', 1000, 'activo');

  -- Create assignment on project A
  perform public.create_asignacion(
    v_admin_a, 'test-suite', v_tenant_a, v_machine_a, v_project_a, v_operator_a, 150, null
  );

  -- Create assignment on project Extra (need a different machine, but we can re-assign after closing)
  -- Actually, we can't create two active assignments on the same machine. Let's close the first one.
  -- But we need both to be active for the filter test... hmm.

  -- Instead, let's create a second active machine in tenant A
  insert into public.maquinas (id, tenant_id, codigo, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, estado)
  values ('ffff4800-0000-0000-0000-000000000009', v_tenant_a, 'MAQ-PT-EXTRA', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 120, 'sin_medicion', 'activa');

  perform public.create_asignacion(
    v_admin_a, 'test-suite', v_tenant_a, 'ffff4800-0000-0000-0000-000000000009', v_project_extra, v_operator_a, 200, null
  );

  -- Filter by project A only
  select count(*) into v_count
  from unnest(public.list_asignaciones_activas(v_tenant_a, v_project_a, null)) r;
  if v_count <> 1 then
    raise exception 'FAIL: filter by project A expected 1, got %', v_count;
  end if;

  -- Filter by project Extra only
  select count(*) into v_count
  from unnest(public.list_asignaciones_activas(v_tenant_a, v_project_extra, null)) r;
  if v_count <> 1 then
    raise exception 'FAIL: filter by project Extra expected 1, got %', v_count;
  end if;

  -- No filter (both projects)
  select count(*) into v_count
  from unnest(public.list_asignaciones_activas(v_tenant_a, null, null)) r;
  if v_count <> 2 then
    raise exception 'FAIL: no filter expected 2, got %', v_count;
  end if;

  raise notice 'PASS: proyecto filter works correctly';
end $$;

rollback to savepoint test16;

--
-- TEST 17: list_asignaciones_activas with p_maquina_id filter
--
\echo 'Test 17: list_asignaciones_activas with p_maquina_id'
savepoint test17;
set local role service_role;

do $$
declare
  v_tenant_a uuid := 'aaaa4800-0000-0000-0000-000000000001';
  v_admin_a uuid := 'cccc4800-0000-0000-0000-000000000001';
  v_operator_a uuid := 'cccc4800-0000-0000-0000-000000000003';
  v_project_a uuid := 'hhhh4800-0000-0000-0000-000000000001';
  v_machine_1 uuid := 'ffff4800-0000-0000-0000-000000000001';
  v_machine_2 uuid := 'ffff4800-0000-0000-0000-000000000010';
  v_count int;
  v_extra_project uuid := 'hhhh4800-0000-0000-0000-000000000010';
begin
  -- Create second active por_tiempo machine in tenant A
  insert into public.maquinas (id, tenant_id, codigo, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, estado)
  values (v_machine_2, v_tenant_a, 'MAQ-PT-FILTER', 'por_tiempo', 'eeee4800-0000-0000-0000-000000000001', 110, 'sin_medicion', 'activa');

  -- Need a second project for the second machine (can't have 2 active on same machine)
  insert into public.proyectos (id, tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, forma_cobro, monto_fijo, estado)
  values (v_extra_project, v_tenant_a, 'Project Filter', 'abab4800-0000-0000-0000-000000000001', 'Location Filter', '2026-01-01', 'monto_fijo', 2000, 'activo');

  -- Create assignment on machine 1
  perform public.create_asignacion(
    v_admin_a, 'test-suite', v_tenant_a, v_machine_1, v_project_a, v_operator_a, 150, null
  );

  -- Create assignment on machine 2
  perform public.create_asignacion(
    v_admin_a, 'test-suite', v_tenant_a, v_machine_2, v_extra_project, v_operator_a, 200, null
  );

  -- Filter by machine 1
  select count(*) into v_count
  from unnest(public.list_asignaciones_activas(v_tenant_a, null, v_machine_1)) r;
  if v_count <> 1 then
    raise exception 'FAIL: filter by machine 1 expected 1, got %', v_count;
  end if;

  -- Filter by machine 2
  select count(*) into v_count
  from unnest(public.list_asignaciones_activas(v_tenant_a, null, v_machine_2)) r;
  if v_count <> 1 then
    raise exception 'FAIL: filter by machine 2 expected 1, got %', v_count;
  end if;

  -- Both filters (both match)
  select count(*) into v_count
  from unnest(public.list_asignaciones_activas(v_tenant_a, null, null)) r;
  if v_count <> 2 then
    raise exception 'FAIL: no filter expected 2, got %', v_count;
  end if;

  raise notice 'PASS: maquina filter works correctly';
end $$;

rollback to savepoint test17;

\echo 'All asignaciones maquina tests passed.';
rollback;
