-- RLS multitenant isolation verification — issue #16
-- Validates tenant-aware RLS policies on authorization tables.
-- Run against local Supabase/Postgres after `supabase db reset`.
-- Usage: psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/rls_multitenant_isolation.sql

\set ON_ERROR_STOP on

\echo '=== RLS Multitenant Isolation Tests ==='

begin;

-- --------------------------------------------------------
-- Setup: two tenants, two users per tenant, roles, capabilities
-- All inserts run as superuser (bypasses RLS).
-- --------------------------------------------------------

-- Tenants
insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values
  ('aaaa0000-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a', 'UTC', 'USD', 'active', 'liters'),
  ('aaaa0000-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b', 'UTC', 'USD', 'active', 'liters');

-- Auth users (Supabase auth.users)
insert into auth.users (id, email, email_confirmed_at)
values
  ('bbbb0000-0000-0000-0000-000000000001', 'a1@test.com', now()),
  ('bbbb0000-0000-0000-0000-000000000002', 'a2@test.com', now()),
  ('bbbb0000-0000-0000-0000-000000000003', 'b1@test.com', now()),
  ('bbbb0000-0000-0000-0000-000000000004', 'b2@test.com', now()),
  ('bbbb0000-0000-0000-0000-000000000005', 'new@test.com', now())
on conflict (id) do nothing;

-- User profiles
insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values
  ('cccc0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'a1@test.com', 'Alice A1'),
  ('cccc0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002', 'a2@test.com', 'Alice A2'),
  ('cccc0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000003', 'b1@test.com', 'Bob B1'),
  ('cccc0000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000004', 'b2@test.com', 'Bob B2');

-- Capabilities (global catalog)
insert into capabilities (id, key, name)
values
  ('eeee0000-0000-0000-0000-000000000001', 'read:reports', 'Read Reports'),
  ('eeee0000-0000-0000-0000-000000000002', 'write:reports', 'Write Reports');

-- Roles (tenant-scoped)
insert into roles (id, tenant_id, name, is_system, is_web_access)
values
  ('dddd0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'admin', true, true),
  ('dddd0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002', 'admin', true, true),
  ('dddd0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000001', 'viewer', false, true);

-- Role capabilities
insert into role_capabilities (role_id, capability_id)
values
  ('dddd0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000001'),
  ('dddd0000-0000-0000-0000-000000000002', 'eeee0000-0000-0000-0000-000000000001');

-- User roles
insert into user_roles (tenant_id, user_id, role_id)
values
  ('aaaa0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000001'),
  ('aaaa0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000003', 'dddd0000-0000-0000-0000-000000000002');

-- User capability overrides
insert into user_capability_overrides (user_id, capability_id, grant_type, tenant_id)
values
  ('cccc0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000002', 'allow', 'aaaa0000-0000-0000-0000-000000000001'),
  ('cccc0000-0000-0000-0000-000000000003', 'eeee0000-0000-0000-0000-000000000002', 'deny',  'aaaa0000-0000-0000-0000-000000000002');

-- Audit log entries (one per tenant, plus one with null actor/target)
insert into audit_log (id, tenant_id, actor_user_id, target_user_id, action)
values
  ('ffff0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000002', 'role_assigned'),
  ('ffff0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000003', 'cccc0000-0000-0000-0000-000000000004', 'role_assigned'),
  ('ffff0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000002', null, null, 'system_event');

\echo '--- Setup complete ---'

-- ========================================================
-- Test 1: Tenant A CAN SELECT own user_profiles
-- Covers: "Cross-tenant profile access is denied" (positive case)
-- ========================================================
\echo 'Test 1: Tenant A user can SELECT own-tenant user_profiles'
savepoint rls_test1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from user_profiles;
  if v_count = 2 then
    raise notice 'PASS: tenant A sees exactly 2 own profiles';
  else
    raise exception 'FAIL: tenant A sees % profiles (expected 2)', v_count;
  end if;
end $$;

rollback to savepoint rls_test1;

-- ========================================================
-- Test 2: Tenant A CANNOT SELECT tenant B user_profiles
-- Covers: "Cross-tenant profile access is denied"
-- ========================================================
\echo 'Test 2: Tenant A user CANNOT SELECT tenant B user_profiles'
savepoint rls_test2;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from user_profiles
  where tenant_id = 'aaaa0000-0000-0000-0000-000000000002';
  if v_count = 0 then
    raise notice 'PASS: tenant A cannot see tenant B profiles';
  else
    raise exception 'FAIL: tenant A sees % tenant B profiles (expected 0)', v_count;
  end if;
end $$;

rollback to savepoint rls_test2;

-- ========================================================
-- Test 3: Tenant A CANNOT UPDATE tenant B user_profiles
-- Covers: "Cross-tenant profile access is denied"
-- ========================================================
\echo 'Test 3: Tenant A user CANNOT UPDATE tenant B user_profiles'
savepoint rls_test3;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_updated int;
begin
  update user_profiles
  set full_name = 'HACKED'
  where id = 'cccc0000-0000-0000-0000-000000000003'; -- tenant B user
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise notice 'PASS: tenant A cannot update tenant B profile';
  else
    raise exception 'FAIL: tenant A updated % tenant B profiles (expected 0)', v_updated;
  end if;
end $$;

rollback to savepoint rls_test3;

-- ========================================================
-- Test 4: Tenant A CANNOT DELETE user_profiles (hard delete deny)
-- Covers: "Cross-tenant profile access is denied" + delete deny
-- ========================================================
\echo 'Test 4: Authenticated user CANNOT DELETE user_profiles (hard delete deny)'
savepoint rls_test4;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_deleted int;
begin
  delete from user_profiles
  where id = 'cccc0000-0000-0000-0000-000000000001'; -- own tenant user
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise notice 'PASS: hard delete on user_profiles denied';
  else
    raise exception 'FAIL: deleted % user_profiles rows (expected 0 — hard delete should be denied)', v_deleted;
  end if;
end $$;

rollback to savepoint rls_test4;

-- ========================================================
-- Test 5: Tenant A CANNOT INSERT user_profiles with tenant B's tenant_id
-- Covers: WITH CHECK enforcement on INSERT
-- ========================================================
\echo 'Test 5: Tenant A CANNOT INSERT user_profiles with different tenant_id'
savepoint rls_test5;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
begin
  begin
    insert into user_profiles (tenant_id, auth_user_id, email)
    values (
      'aaaa0000-0000-0000-0000-000000000002', -- tenant B
      gen_random_uuid(),
      'cross-tenant@test.com'
    );
    raise exception 'FAIL: cross-tenant INSERT on user_profiles was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-tenant INSERT on user_profiles denied';
  end;
end $$;

rollback to savepoint rls_test5;

-- ========================================================
-- Test 6: Tenant A CANNOT SELECT tenant B roles
-- Covers: "Cross-tenant role access is denied"
-- ========================================================
\echo 'Test 6: Tenant A user CANNOT SELECT tenant B roles'
savepoint rls_test6;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from roles
  where tenant_id = 'aaaa0000-0000-0000-0000-000000000002';
  if v_count = 0 then
    raise notice 'PASS: tenant A cannot see tenant B roles';
  else
    raise exception 'FAIL: tenant A sees % tenant B roles (expected 0)', v_count;
  end if;
end $$;

rollback to savepoint rls_test6;

-- ========================================================
-- Test 7: Tenant A CANNOT INSERT roles with tenant B's tenant_id
-- Covers: WITH CHECK enforcement on roles INSERT
-- ========================================================
\echo 'Test 7: Tenant A CANNOT INSERT roles with different tenant_id'
savepoint rls_test7;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
begin
  begin
    insert into roles (tenant_id, name)
    values ('aaaa0000-0000-0000-0000-000000000002', 'hacker-role');
    raise exception 'FAIL: cross-tenant INSERT on roles was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-tenant INSERT on roles denied';
  end;
end $$;

rollback to savepoint rls_test7;

-- ========================================================
-- Test 8: Tenant A CANNOT SELECT tenant B user_capability_overrides
-- Covers: "Cross-tenant grants and overrides stay hidden"
-- ========================================================
\echo 'Test 8: Tenant A user CANNOT SELECT tenant B user_capability_overrides'
savepoint rls_test8;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from user_capability_overrides
  where tenant_id = 'aaaa0000-0000-0000-0000-000000000002';
  if v_count = 0 then
    raise notice 'PASS: tenant A cannot see tenant B overrides';
  else
    raise exception 'FAIL: tenant A sees % tenant B overrides (expected 0)', v_count;
  end if;
end $$;

rollback to savepoint rls_test8;

-- ========================================================
-- Test 9: Tenant A CANNOT SELECT tenant B audit_log
-- Covers: "Null actor or target does not break tenant isolation"
-- ========================================================
\echo 'Test 9: Tenant A user CANNOT SELECT tenant B audit_log (including null actor/target rows)'
savepoint rls_test9;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
  v_null_count int;
begin
  -- Should see 0 tenant B rows
  select count(*) into v_count
  from audit_log
  where tenant_id = 'aaaa0000-0000-0000-0000-000000000002';

  -- Specifically check the null actor/target row is also hidden
  select count(*) into v_null_count
  from audit_log
  where id = 'ffff0000-0000-0000-0000-000000000003'; -- tenant B, null actor/target

  if v_count = 0 and v_null_count = 0 then
    raise notice 'PASS: tenant A cannot see tenant B audit rows (including null actor/target)';
  else
    raise exception 'FAIL: tenant A sees % tenant B audit rows, % null-actor rows (expected 0, 0)', v_count, v_null_count;
  end if;
end $$;

rollback to savepoint rls_test9;

-- ========================================================
-- Test 10: Tenant A CAN SELECT own audit_log
-- Covers: positive case for audit access
-- ========================================================
\echo 'Test 10: Tenant A user CAN SELECT own-tenant audit_log'
savepoint rls_test10;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from audit_log;
  if v_count = 1 then
    raise notice 'PASS: tenant A sees exactly 1 own audit row';
  else
    raise exception 'FAIL: tenant A sees % audit rows (expected 1)', v_count;
  end if;
end $$;

rollback to savepoint rls_test10;

-- ========================================================
-- Test 11: Join-based RLS — Tenant A CANNOT SELECT tenant B user_roles
-- Covers: "Cross-tenant role access is denied" (join-based)
-- ========================================================
\echo 'Test 11: Tenant A user CANNOT SELECT tenant B user_roles (join-based RLS)'
savepoint rls_test11;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from user_roles ur
  join roles r on r.id = ur.role_id
  where r.tenant_id = 'aaaa0000-0000-0000-0000-000000000002';
  if v_count = 0 then
    raise notice 'PASS: tenant A cannot see tenant B user_roles via join';
  else
    raise exception 'FAIL: tenant A sees % tenant B user_roles (expected 0)', v_count;
  end if;
end $$;

rollback to savepoint rls_test11;

-- ========================================================
-- Test 12: Join-based RLS — Tenant A CAN SELECT own user_roles
-- Covers: positive case for join-based isolation
-- ========================================================
\echo 'Test 12: Tenant A user CAN SELECT own-tenant user_roles (join-based RLS)'
savepoint rls_test12;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from user_roles;
  if v_count = 1 then
    raise notice 'PASS: tenant A sees exactly 1 own user_role';
  else
    raise exception 'FAIL: tenant A sees % user_roles (expected 1)', v_count;
  end if;
end $$;

rollback to savepoint rls_test12;

-- ========================================================
-- Test 13: Join-based RLS — Tenant A CANNOT SELECT tenant B role_capabilities
-- Covers: "Cross-tenant grants and overrides stay hidden" (join-based)
-- ========================================================
\echo 'Test 13: Tenant A user CANNOT SELECT tenant B role_capabilities (join-based RLS)'
savepoint rls_test13;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from role_capabilities rc
  join roles r on r.id = rc.role_id
  where r.tenant_id = 'aaaa0000-0000-0000-0000-000000000002';
  if v_count = 0 then
    raise notice 'PASS: tenant A cannot see tenant B role_capabilities via join';
  else
    raise exception 'FAIL: tenant A sees % tenant B role_capabilities (expected 0)', v_count;
  end if;
end $$;

rollback to savepoint rls_test13;

-- ========================================================
-- Test 14: Join-based RLS — Tenant A CAN SELECT own role_capabilities
-- Covers: positive case for join-based grant isolation
-- ========================================================
\echo 'Test 14: Tenant A user CAN SELECT own-tenant role_capabilities (join-based RLS)'
savepoint rls_test14;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from role_capabilities;
  if v_count = 1 then
    raise notice 'PASS: tenant A sees exactly 1 own role_capability';
  else
    raise exception 'FAIL: tenant A sees % role_capabilities (expected 1)', v_count;
  end if;
end $$;

rollback to savepoint rls_test14;

-- ========================================================
-- Test 15: capabilities table remains readable (global catalog, no tenant filter)
-- Covers: "Role grants reference shared capabilities" — global catalog
-- ========================================================
\echo 'Test 15: capabilities table readable by all authenticated users (global catalog)'
savepoint rls_test15;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from capabilities;
  if v_count = 2 then
    raise notice 'PASS: capabilities global catalog readable (2 rows)';
  else
    raise exception 'FAIL: capabilities returned % rows (expected 2 — global catalog)', v_count;
  end if;
end $$;

rollback to savepoint rls_test15;

-- ========================================================
-- Test 16: Missing JWT claim denies access (null-safe)
-- Covers: "Null actor or target does not break tenant isolation"
-- ========================================================
\echo 'Test 16: Missing JWT app_metadata.tenant_id denies access to all tenant-scoped tables'
savepoint rls_test16;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{}}';

do $$
declare
  v_profiles int;
  v_roles int;
  v_audit int;
begin
  select count(*) into v_profiles from user_profiles;
  select count(*) into v_roles from roles;
  select count(*) into v_audit from audit_log;

  if v_profiles = 0 and v_roles = 0 and v_audit = 0 then
    raise notice 'PASS: missing tenant claim denies access to all tenant-scoped tables';
  else
    raise exception 'FAIL: missing tenant claim still returned profiles=% roles=% audit=% (expected 0,0,0)',
      v_profiles, v_roles, v_audit;
  end if;
end $$;

rollback to savepoint rls_test16;

-- ========================================================
-- Test 17: Tenant A CAN INSERT own-tenant user_profiles
-- Covers: positive INSERT with WITH CHECK
-- ========================================================
\echo 'Test 17: Tenant A user CAN INSERT own-tenant user_profiles'
savepoint rls_test17;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  insert into user_profiles (tenant_id, auth_user_id, email)
  values ('aaaa0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000005', 'new-a-user@test.com');

  select count(*) into v_count from user_profiles where email = 'new-a-user@test.com';
  if v_count = 1 then
    raise notice 'PASS: tenant A can insert own-tenant user_profiles';
  else
    raise exception 'FAIL: own-tenant INSERT on user_profiles failed';
  end if;
end $$;

rollback to savepoint rls_test17;

-- ========================================================
-- Test 18: Tenant B CAN SELECT own user_profiles (symmetry check)
-- Covers: ensures isolation works for both tenants
-- ========================================================
\echo 'Test 18: Tenant B user CAN SELECT own-tenant user_profiles (symmetry)'
savepoint rls_test18;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa0000-0000-0000-0000-000000000002"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from user_profiles;
  if v_count = 2 then
    raise notice 'PASS: tenant B sees exactly 2 own profiles';
  else
    raise exception 'FAIL: tenant B sees % profiles (expected 2)', v_count;
  end if;
end $$;

rollback to savepoint rls_test18;

\echo '=== All RLS multitenant isolation tests complete ==='

rollback;
