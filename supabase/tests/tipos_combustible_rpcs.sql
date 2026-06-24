-- Verification for fuel type catalog RPCs (issue #46 PR1).
-- Tests: create, update, hide, tenant isolation, unique violations.
-- Run: psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/tipos_combustible_rpcs.sql

\set ON_ERROR_STOP on

\echo '=== Fuel type catalog RPC verification ==='

begin;

-- --------------------------------------------------------
-- Setup: tenants + auth users + profiles + fuel_types capabilities
-- --------------------------------------------------------
insert into tenants (
  id,
  name,
  slug,
  timezone,
  currency,
  status,
  fuel_unit
) values
  ('11110000-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a', 'UTC', 'USD', 'active', 'liters'),
  ('11110000-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b', 'UTC', 'USD', 'active', 'liters')
on conflict (id) do nothing;

insert into auth.users (id, email, email_confirmed_at)
values
  ('22220000-0000-0000-0000-000000000001', 'tenant-a-user@test.com', now()),
  ('22220000-0000-0000-0000-000000000002', 'tenant-b-user@test.com', now())
on conflict (id) do nothing;

insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values
  ('33330000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-000000000001', 'tenant-a-user@test.com', 'Alice Tenant A'),
  ('33330000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002', 'tenant-b-user@test.com', 'Bob Tenant B')
on conflict (id) do nothing;

-- Seed active fuel types for each tenant (via service_role to bypass RLS).
set local role service_role;
insert into public.tipos_combustible (tenant_id, nombre, estado)
values
  ('11110000-0000-0000-0000-000000000001', 'Diésel', 'activo'),
  ('11110000-0000-0000-0000-000000000001', 'Nafta', 'oculto'),
  ('11110000-0000-0000-0000-000000000002', 'Kerosene', 'activo'),
  ('11110000-0000-0000-0000-000000000002', 'Gas Oil', 'activo')
on conflict do nothing;

-- Grant capabilities to test users.
insert into roles (id, tenant_id, name)
values
  ('44440000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'Fuel Manager A'),
  ('44440000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002', 'Fuel Manager B')
on conflict (id) do nothing;

-- Tenant A user gets fuel_types:create + fuel_types:read + fuel_types:update
insert into role_capabilities (role_id, capability_id)
select r.id, c.id
from roles r
cross join capabilities c
where r.id = '44440000-0000-0000-0000-000000000001'
  and c.key in ('fuel_types:create', 'fuel_types:read', 'fuel_types:update')
on conflict do nothing;

-- Tenant B user gets fuel_types:create + fuel_types:read + fuel_types:update
insert into role_capabilities (role_id, capability_id)
select r.id, c.id
from roles r
cross join capabilities c
where r.id = '44440000-0000-0000-0000-000000000002'
  and c.key in ('fuel_types:create', 'fuel_types:read', 'fuel_types:update')
on conflict do nothing;

insert into user_roles (tenant_id, user_id, role_id)
values
  ('11110000-0000-0000-0000-000000000001', '33330000-0000-0000-0000-000000000001', '44440000-0000-0000-0000-000000000001'),
  ('11110000-0000-0000-0000-000000000002', '33330000-0000-0000-0000-000000000002', '44440000-0000-0000-0000-000000000002')
on conflict do nothing;

\echo '--- Test RPC1: Create fuel type via RPC ---'
savepoint rpc1_test;
set local role service_role;

do $$
declare
  v_id uuid;
  v_rec record;
begin
  v_id := public.create_tipo_combustible(
    '33330000-0000-0000-0000-000000000001',  -- p_actor_id (Alice, Tenant A)
    'test-suite',                              -- p_audit_source
    '11110000-0000-0000-0000-000000000001',   -- p_tenant_id (Tenant A)
    'Gasolina Premium'                          -- p_nombre
  );

  if v_id is null then
    raise exception 'FAIL: create_tipo_combustible returned null';
  end if;

  select id, tenant_id, nombre, estado
  into v_rec
  from public.tipos_combustible
  where id = v_id;

  if v_rec.nombre = 'Gasolina Premium'
     and v_rec.estado = 'activo'
     and v_rec.tenant_id = '11110000-0000-0000-0000-000000000001' then
    raise notice 'PASS: create_tipo_combustible creates with estado=activo';
  else
    raise exception 'FAIL: create_tipo_combustible returned unexpected record: %', v_rec;
  end if;
end $$;

rollback to savepoint rpc1_test;

\echo '--- Test RPC2: Update fuel type via RPC ---'
savepoint rpc2_test;
set local role service_role;

do $$
declare
  v_result boolean;
  v_nombre text;
begin
  v_result := public.update_tipo_combustible(
    '33330000-0000-0000-0000-000000000001',  -- p_actor_id
    'test-suite',                              -- p_audit_source
    '11110000-0000-0000-0000-000000000001',   -- p_tenant_id
    (select id from public.tipos_combustible
     where tenant_id = '11110000-0000-0000-0000-000000000001'
       and nombre = 'Diésel'
       and estado = 'activo'
     limit 1),                                 -- p_fuel_type_id
    'Diésel Premium'                           -- p_nombre
  );

  if not v_result then
    raise exception 'FAIL: update_tipo_combustible returned false for existing row';
  end if;

  select nombre into v_nombre
  from public.tipos_combustible
  where tenant_id = '11110000-0000-0000-0000-000000000001'
    and nombre = 'Diésel Premium';

  if v_nombre = 'Diésel Premium' then
    raise notice 'PASS: update_tipo_combustible updates nombre';
  else
    raise exception 'FAIL: update_tipo_combustible did not persist change';
  end if;
end $$;

rollback to savepoint rpc2_test;

\echo '--- Test RPC3: Hide fuel type via RPC ---'
savepoint rpc3_test;
set local role service_role;

do $$
declare
  v_result boolean;
  v_estado text;
  v_target_id uuid;
begin
  select id into v_target_id
  from public.tipos_combustible
  where tenant_id = '11110000-0000-0000-0000-000000000001'
    and nombre = 'Diésel'
    and estado = 'activo'
  limit 1;

  v_result := public.hide_tipo_combustible(
    '33330000-0000-0000-0000-000000000001',  -- p_actor_id
    'test-suite',                              -- p_audit_source
    '11110000-0000-0000-0000-000000000001',   -- p_tenant_id
    v_target_id                                 -- p_fuel_type_id
  );

  if not v_result then
    raise exception 'FAIL: hide_tipo_combustible returned false for existing row';
  end if;

  select estado into v_estado
  from public.tipos_combustible
  where id = v_target_id;

  if v_estado = 'oculto' then
    raise notice 'PASS: hide_tipo_combustible sets estado=oculto';
  else
    raise exception 'FAIL: hide_tipo_combustible estado is % (expected oculto)', v_estado;
  end if;
end $$;

rollback to savepoint rpc3_test;

\echo '--- Test RPC4: Tenant isolation — cross-tenant update returns false ---'
savepoint rpc4_test;
set local role service_role;

do $$
declare
  v_result boolean;
begin
  -- Tenant A actor tries to update Tenant B's fuel type.
  v_result := public.update_tipo_combustible(
    '33330000-0000-0000-0000-000000000001',  -- p_actor_id (Tenant A)
    'test-suite',
    '11110000-0000-0000-0000-000000000001',   -- p_tenant_id (Tenant A)
    (select id from public.tipos_combustible
     where tenant_id = '11110000-0000-0000-0000-000000000002'
       and nombre = 'Kerosene'
     limit 1),                                 -- p_fuel_type_id (Tenant B!)
    'Hacked'
  );

  if v_result then
    raise exception 'FAIL: cross-tenant update should return false';
  end if;

  raise notice 'PASS: cross-tenant update returns false';

  -- Tenant A actor tries to hide Tenant B's fuel type.
  v_result := public.hide_tipo_combustible(
    '33330000-0000-0000-0000-000000000001',  -- p_actor_id (Tenant A)
    'test-suite',
    '11110000-0000-0000-0000-000000000001',   -- p_tenant_id (Tenant A)
    (select id from public.tipos_combustible
     where tenant_id = '11110000-0000-0000-0000-000000000002'
       and nombre = 'Gas Oil'
     limit 1)                                  -- p_fuel_type_id (Tenant B!)
  );

  if v_result then
    raise exception 'FAIL: cross-tenant hide should return false';
  end if;

  raise notice 'PASS: cross-tenant hide returns false';
end $$;

rollback to savepoint rpc4_test;

\echo '--- Test RPC5: Unique violation on create (same active name, same tenant) ---'
savepoint rpc5_test;
set local role service_role;

do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.create_tipo_combustible(
      '33330000-0000-0000-0000-000000000001',
      'test-suite',
      '11110000-0000-0000-0000-000000000001',
      'Diésel'  -- already exists as active in Tenant A
    );
    raise exception 'FAIL: expected unique_violation for duplicate active name';
  exception
    when unique_violation then
      v_caught := true;
      raise notice 'PASS: unique_violation raised for duplicate active name in same tenant';
  end;

  if not v_caught then
    raise exception 'FAIL: no exception raised for duplicate active name';
  end if;
end $$;

rollback to savepoint rpc5_test;

\echo '--- Test RPC6: Unique violation on update (rename to existing active name) ---'
savepoint rpc6_test;
set local role service_role;

do $$
declare
  v_new_id uuid;
  v_caught boolean := false;
begin
  -- Create a second active row in Tenant A
  v_new_id := public.create_tipo_combustible(
    '33330000-0000-0000-0000-000000000001',
    'test-suite',
    '11110000-0000-0000-0000-000000000001',
    'Nafta Extra'
  );

  -- Rename 'Nafta Extra' → 'Diésel' (collision with existing active row)
  begin
    perform public.update_tipo_combustible(
      '33330000-0000-0000-0000-000000000001',
      'test-suite',
      '11110000-0000-0000-0000-000000000001',
      v_new_id,
      'Diésel'
    );
    raise exception 'FAIL: expected unique_violation for update collision';
  exception
    when unique_violation then
      v_caught := true;
      raise notice 'PASS: unique_violation raised for update rename to existing active name';
  end;

  if not v_caught then
    raise exception 'FAIL: no exception raised for update collision';
  end if;
end $$;

rollback to savepoint rpc6_test;

\echo 'All fuel type catalog RPC checks passed.';

rollback;
