-- Verification for tenant-scoped fuel type catalog (issue #46).
-- Run after creating the migration: `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/tipos_combustible_catalog.sql`

\set ON_ERROR_STOP on

\echo '=== Fuel type catalog verification ==='

begin;

-- --------------------------------------------------------
-- Setup: tenants + auth users + profiles + base data
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

set local role service_role;
insert into public.tipos_combustible (tenant_id, nombre, estado)
values
  ('11110000-0000-0000-0000-000000000001', 'Diésel', 'activo'),
  ('11110000-0000-0000-0000-000000000001', 'Nafta', 'oculto'),
  ('11110000-0000-0000-0000-000000000002', 'Kerosene', 'activo'),
  ('11110000-0000-0000-0000-000000000002', 'Diésel', 'activo')
on conflict do nothing;

\echo '--- Test 1: Tenant A reads own active fuel types only ---'
savepoint tc_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.tipos_combustible;
  if v_count = 1 then
    raise notice 'PASS: tenant A sees only own active fuel type';
  else
    raise exception 'FAIL: tenant A sees % active fuel types (expected 1)', v_count;
  end if;
end $$;

rollback to savepoint tc_test1;

\echo '--- Test 2: Tenant A does not see tenant B fuel types ---'
savepoint tc_test2;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.tipos_combustible
  where tenant_id = '11110000-0000-0000-0000-000000000002';

  if v_count = 0 then
    raise notice 'PASS: tenant A cannot query tenant B catalog rows';
  else
    raise exception 'FAIL: tenant A sees % rows in tenant B', v_count;
  end if;
end $$;

rollback to savepoint tc_test2;

\echo '--- Test 3: Tenant A cannot mutate tenant B fuel types ---'
savepoint tc_test3;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_updated int;
  v_deleted int;
begin
  update public.tipos_combustible
    set nombre = 'Hackeado'
    where tenant_id = '11110000-0000-0000-0000-000000000002';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise notice 'PASS: tenant A cannot update tenant B records';
  else
    raise exception 'FAIL: tenant A updated % tenant B records', v_updated;
  end if;

  delete from public.tipos_combustible
    where tenant_id = '11110000-0000-0000-0000-000000000002';
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise notice 'PASS: tenant A cannot hard delete tenant B records';
  else
    raise exception 'FAIL: tenant A deleted % tenant B records', v_deleted;
  end if;
end $$;

rollback to savepoint tc_test3;

\echo '--- Test 4: Active name uniqueness is tenant-local ---'
savepoint tc_test4;
set local role service_role;

do $$
declare
  existing_name_id uuid;
begin
  select id into existing_name_id
  from public.tipos_combustible
  where tenant_id = '11110000-0000-0000-0000-000000000001'
    and nombre = 'Diésel'
    and estado = 'activo'
  limit 1;

  if existing_name_id is null then
    raise exception 'FAIL: expected base active row for uniqueness check';
  end if;

  begin
    insert into public.tipos_combustible (tenant_id, nombre, estado)
    values ('11110000-0000-0000-0000-000000000001', 'Diésel', 'activo');
    raise exception 'FAIL: duplicate active name accepted in same tenant';
  exception
    when unique_violation then
      raise notice 'PASS: duplicate active name in same tenant rejected';
  end;

  insert into public.tipos_combustible (tenant_id, nombre, estado)
  values ('11110000-0000-0000-0000-000000000002', 'Diésel', 'activo');
  raise notice 'PASS: same active name accepted in different tenant';

  -- cleanup temporary row for tenant B created by this test
  delete from public.tipos_combustible
  where tenant_id = '11110000-0000-0000-0000-000000000002'
    and id is not null
    and nombre = 'Diésel'
    and estado = 'activo'
    and id <> existing_name_id;
end $$;

rollback to savepoint tc_test4;

\echo '--- Test 5: Hidden rows are excluded from active list ---'
savepoint tc_test5;
set local role service_role;

update public.tipos_combustible
  set estado = 'oculto'
  where tenant_id = '11110000-0000-0000-0000-000000000001'
    and nombre = 'Diésel'
    and estado = 'activo';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
    select count(*) into v_count
    from public.tipos_combustible
    where nombre = 'Diésel' and estado = 'activo';

  if v_count = 0 then
    raise notice 'PASS: hidden fuel type is not listed in active view';
  else
    raise exception 'FAIL: hidden row appeared in active list';
  end if;
end $$;

rollback to savepoint tc_test5;

\echo '--- Test 6: Authenticated users cannot hard delete fuel types ---'
savepoint tc_test6;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_deleted int;
begin
delete from public.tipos_combustible
  where tenant_id = '11110000-0000-0000-0000-000000000001'
  and id = (
    select id
    from public.tipos_combustible
    where tenant_id = '11110000-0000-0000-0000-000000000001'
    limit 1
  );
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise notice 'PASS: authenticated user cannot hard delete';
  else
    raise exception 'FAIL: authenticated user hard-deleted % rows', v_deleted;
  end if;
end $$;

rollback to savepoint tc_test6;

\echo 'All fuel type catalog checks passed.';

rollback;
