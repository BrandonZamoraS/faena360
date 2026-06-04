-- DB-level constraint and cascade verification for authorization schema.
-- Run against local Supabase/Postgres after `supabase db reset`.
-- Usage: psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/authorization_constraints.sql

\set ON_ERROR_STOP on

-- Helper: assert a statement raises a specific constraint error.
-- Uses savepoints inside a transaction so each test is isolated.

\echo '=== Authorization Constraint Tests ==='

-- --------------------------------------------------------
-- Setup: create test tenant, users, roles, capabilities
-- --------------------------------------------------------
begin;

-- Insert a test tenant
insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Test Tenant',
  'test-tenant',
  'UTC',
  'USD',
  'active',
  'liters'
);

-- Insert a second tenant for cross-tenant isolation tests
insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values (
  'a0000000-0000-0000-0000-000000000002',
  'Test Tenant 2',
  'test-tenant-2',
  'UTC',
  'USD',
  'active',
  'gallons_us'
);

-- We need auth.users rows for FK references.
-- In Supabase local dev, auth.users exists. We insert test users directly.
insert into auth.users (id, email, email_confirmed_at)
values
  ('b0000000-0000-0000-0000-000000000001', 'user1@test.com', now()),
  ('b0000000-0000-0000-0000-000000000002', 'user2@test.com', now())
on conflict (id) do nothing;

-- Insert user profiles
insert into user_profiles (id, tenant_id, auth_user_id, email, phone)
values
  ('c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'profile1@test.com',
   '+1111111111'),
  ('c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   'profile2@test.com',
   '+2222222222');

-- Insert capabilities
insert into capabilities (id, key, name)
values
  ('d0000000-0000-0000-0000-000000000001', 'read:reports', 'Read Reports'),
  ('d0000000-0000-0000-0000-000000000002', 'write:reports', 'Write Reports');

-- Insert roles
insert into roles (id, tenant_id, name, is_system, is_web_access)
values
  ('e0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'admin', true, true),
  ('e0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'viewer', false, true);

\echo '--- Setup complete ---'

-- --------------------------------------------------------
-- Test 1: Global uniqueness on user_profiles.email
-- --------------------------------------------------------
\echo 'Test 1: Duplicate email rejected'
savepoint test1;
do $$
begin
  begin
    insert into user_profiles (tenant_id, auth_user_id, email)
    values (
      'a0000000-0000-0000-0000-000000000001',
      gen_random_uuid(), -- new auth user
      'profile1@test.com' -- duplicate
    );
    raise exception 'FAIL: duplicate email was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate email rejected';
  end;
end $$;
rollback to savepoint test1;

-- --------------------------------------------------------
-- Test 2: Global uniqueness on user_profiles.phone
-- --------------------------------------------------------
\echo 'Test 2: Duplicate phone rejected'
savepoint test2;
do $$
begin
  begin
    insert into user_profiles (tenant_id, auth_user_id, phone)
    values (
      'a0000000-0000-0000-0000-000000000001',
      gen_random_uuid(),
      '+1111111111' -- duplicate
    );
    raise exception 'FAIL: duplicate phone was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate phone rejected';
  end;
end $$;
rollback to savepoint test2;

-- --------------------------------------------------------
-- Test 3: Global uniqueness on user_profiles.auth_user_id
-- --------------------------------------------------------
\echo 'Test 3: Duplicate auth_user_id rejected'
savepoint test3;
do $$
begin
  begin
    insert into user_profiles (tenant_id, auth_user_id, email)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000001', -- duplicate
      'unique_email@test.com'
    );
    raise exception 'FAIL: duplicate auth_user_id was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate auth_user_id rejected';
  end;
end $$;
rollback to savepoint test3;

-- --------------------------------------------------------
-- Test 4: Tenant-scoped role uniqueness — same name in same tenant rejected
-- --------------------------------------------------------
\echo 'Test 4: Duplicate (tenant_id, name) in roles rejected'
savepoint test4;
do $$
begin
  begin
    insert into roles (tenant_id, name)
    values ('a0000000-0000-0000-0000-000000000001', 'admin'); -- duplicate
    raise exception 'FAIL: duplicate role name in same tenant was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate role name in same tenant rejected';
  end;
end $$;
rollback to savepoint test4;

-- --------------------------------------------------------
-- Test 5: Different tenants CAN share role names
-- --------------------------------------------------------
\echo 'Test 5: Same role name in different tenants allowed'
savepoint test5;
insert into roles (tenant_id, name)
values ('a0000000-0000-0000-0000-000000000002', 'admin'); -- same name, different tenant
do $$
begin
  raise notice 'PASS: same role name in different tenant accepted';
end $$;
rollback to savepoint test5;

-- --------------------------------------------------------
-- Test 6: Duplicate (user_id, role_id) in user_roles rejected
-- --------------------------------------------------------
\echo 'Test 6: Duplicate user_roles assignment rejected'
savepoint test6;
insert into user_roles (tenant_id, user_id, role_id)
values (
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001'
);
do $$
begin
  begin
    insert into user_roles (tenant_id, user_id, role_id)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001'
    ); -- duplicate
    raise exception 'FAIL: duplicate user_roles was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate user_roles rejected';
  end;
end $$;
rollback to savepoint test6;

-- --------------------------------------------------------
-- Test 7: Duplicate (role_id, capability_id) in role_capabilities rejected
-- --------------------------------------------------------
\echo 'Test 7: Duplicate role_capabilities rejected'
savepoint test7;
insert into role_capabilities (role_id, capability_id)
values (
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001'
);
do $$
begin
  begin
    insert into role_capabilities (role_id, capability_id)
    values (
      'e0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001'
    ); -- duplicate
    raise exception 'FAIL: duplicate role_capabilities was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate role_capabilities rejected';
  end;
end $$;
rollback to savepoint test7;

-- --------------------------------------------------------
-- Test 8: Duplicate (user_id, capability_id) in user_capability_overrides rejected
-- --------------------------------------------------------
\echo 'Test 8: Duplicate user_capability_overrides rejected'
savepoint test8;
insert into user_capability_overrides (user_id, capability_id, grant_type)
values (
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'allow'
);
do $$
begin
  begin
    insert into user_capability_overrides (user_id, capability_id, grant_type)
    values (
      'c0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      'deny'
    ); -- duplicate key, different grant_type
    raise exception 'FAIL: duplicate user_capability_overrides was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate user_capability_overrides rejected';
  end;
end $$;
rollback to savepoint test8;

-- --------------------------------------------------------
-- Test 9: FK cascade — deleting role cascades to role_capabilities and user_roles
-- --------------------------------------------------------
\echo 'Test 9: Deleting role cascades to join tables'
savepoint test9;

insert into user_roles (tenant_id, user_id, role_id)
values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');
insert into role_capabilities (role_id, capability_id)
values ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002');

delete from roles where id = 'e0000000-0000-0000-0000-000000000002';

do $$
declare
  ur_count int;
  rc_count int;
begin
  select count(*) into ur_count from user_roles where role_id = 'e0000000-0000-0000-0000-000000000002';
  select count(*) into rc_count from role_capabilities where role_id = 'e0000000-0000-0000-0000-000000000002';
  if ur_count = 0 and rc_count = 0 then
    raise notice 'PASS: cascade deleted user_roles and role_capabilities';
  else
    raise exception 'FAIL: cascade did not clean join tables (user_roles=%, role_capabilities=%)', ur_count, rc_count;
  end if;
end $$;
rollback to savepoint test9;

-- --------------------------------------------------------
-- Test 10: FK cascade — deleting capability cascades to role_capabilities and user_capability_overrides
-- --------------------------------------------------------
\echo 'Test 10: Deleting capability cascades to join tables'
savepoint test10;

insert into role_capabilities (role_id, capability_id)
values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002');
insert into user_capability_overrides (user_id, capability_id, grant_type)
values ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'deny');

delete from capabilities where id = 'd0000000-0000-0000-0000-000000000002';

do $$
declare
  rc_count int;
  uco_count int;
begin
  select count(*) into rc_count from role_capabilities where capability_id = 'd0000000-0000-0000-0000-000000000002';
  select count(*) into uco_count from user_capability_overrides where capability_id = 'd0000000-0000-0000-0000-000000000002';
  if rc_count = 0 and uco_count = 0 then
    raise notice 'PASS: cascade deleted role_capabilities and user_capability_overrides';
  else
    raise exception 'FAIL: cascade did not clean join tables (role_capabilities=%, user_capability_overrides=%)', rc_count, uco_count;
  end if;
end $$;
rollback to savepoint test10;

-- --------------------------------------------------------
-- Test 11: FK on audit_log — deleting users sets actor/target to null (preserves history)
-- --------------------------------------------------------
\echo 'Test 11: Deleting users sets audit_log refs to null'
savepoint test11;

insert into audit_log (actor_user_id, target_user_id, action)
values (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'role_assigned'
);

-- Delete user profiles (cascade will clean join tables, SET NULL on audit_log)
delete from user_profiles where id = 'c0000000-0000-0000-0000-000000000001';
delete from user_profiles where id = 'c0000000-0000-0000-0000-000000000002';

do $$
declare
  v_actor uuid;
  v_target uuid;
  v_action text;
begin
  select actor_user_id, target_user_id, action into v_actor, v_target, v_action
  from audit_log where action = 'role_assigned' limit 1;

  if v_actor is null and v_target is null and v_action = 'role_assigned' then
    raise notice 'PASS: audit_log actor and target set to null, row preserved';
  else
    raise exception 'FAIL: audit_log actor=%, target=%, action=% (expected null, null, role_assigned)', v_actor, v_target, v_action;
  end if;
end $$;
rollback to savepoint test11;

-- --------------------------------------------------------
-- Test 12: fuel_unit check constraint
-- --------------------------------------------------------
\echo 'Test 12: Invalid fuel_unit rejected'
savepoint test12;
do $$
begin
  begin
    update tenants set fuel_unit = 'barrels' where id = 'a0000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: invalid fuel_unit was accepted';
  exception when check_violation then
    raise notice 'PASS: invalid fuel_unit rejected';
  end;
end $$;
rollback to savepoint test12;

-- --------------------------------------------------------
-- Test 13: grant_type check constraint
-- --------------------------------------------------------
\echo 'Test 13: Invalid grant_type rejected'
savepoint test13;
do $$
begin
  begin
    insert into user_capability_overrides (user_id, capability_id, grant_type)
    values (
      'c0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000002',
      'maybe'
    );
    raise exception 'FAIL: invalid grant_type was accepted';
  exception when check_violation then
    raise notice 'PASS: invalid grant_type rejected';
  end;
end $$;
rollback to savepoint test13;

-- --------------------------------------------------------
-- Test 14: audit_log minimal scope — expected columns present, vault-only columns absent
-- Covers: "MVP audit scope stays minimal" (authorization-base spec)
-- --------------------------------------------------------
\echo 'Test 14: audit_log minimal scope — expected columns present, vault-only columns absent'
savepoint test14;
do $$
declare
  v_missing text[];
  v_extra text[];
begin
  -- Expected minimal columns must exist
  select array_agg(c) into v_missing
  from unnest(array['id','actor_user_id','target_user_id','action','occurred_at']) as c
  where c not in (
    select column_name from information_schema.columns
    where table_name = 'audit_log' and table_schema = 'public'
  );

  -- Vault-only columns must NOT exist in this phase
  select array_agg(c) into v_extra
  from unnest(array['field','old_value','new_value','entity_type','entity_id','metadata','details','description']) as c
  where c in (
    select column_name from information_schema.columns
    where table_name = 'audit_log' and table_schema = 'public'
  );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'FAIL: audit_log missing expected columns: %', v_missing;
  end if;

  if v_extra is not null and array_length(v_extra, 1) > 0 then
    raise exception 'FAIL: audit_log has vault-only columns beyond MVP scope: %', v_extra;
  end if;

  raise notice 'PASS: audit_log has minimal MVP columns only';
end $$;
rollback to savepoint test14;

-- --------------------------------------------------------
-- Test 15: tenants MVP scope — expected columns present, commercial/fiscal columns absent
-- Covers: "MVP avoids premature commercial data" (infraestructura-base spec)
-- --------------------------------------------------------
\echo 'Test 15: tenants MVP scope — expected columns present, commercial/fiscal columns absent'
savepoint test15;
do $$
declare
  v_missing text[];
  v_extra text[];
begin
  -- Expected MVP columns must exist
  select array_agg(c) into v_missing
  from unnest(array['id','name','slug','timezone','currency','fuel_unit','status','created_at','updated_at']) as c
  where c not in (
    select column_name from information_schema.columns
    where table_name = 'tenants' and table_schema = 'public'
  );

  -- Premature commercial/fiscal columns must NOT exist in this phase
  select array_agg(c) into v_extra
  from unnest(array['tax_id','cuit','razon_social','fiscal_address','commercial_name','logo_url','website','billing_email']) as c
  where c in (
    select column_name from information_schema.columns
    where table_name = 'tenants' and table_schema = 'public'
  );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'FAIL: tenants missing expected MVP columns: %', v_missing;
  end if;

  if v_extra is not null and array_length(v_extra, 1) > 0 then
    raise exception 'FAIL: tenants has premature commercial/fiscal columns: %', v_extra;
  end if;

  raise notice 'PASS: tenants has MVP columns only, no premature commercial/fiscal data';
end $$;
rollback to savepoint test15;

-- --------------------------------------------------------
-- Test 16: Profile linked to exactly one tenant and one auth identity
-- Covers: "Profile is stored for a tenant user" (authorization-base spec)
-- --------------------------------------------------------
\echo 'Test 16: Profile linked to tenant and auth identity'
savepoint test16;
do $$
declare
  v_tenant_id uuid;
  v_auth_user_id uuid;
begin
  select tenant_id, auth_user_id into v_tenant_id, v_auth_user_id
  from user_profiles
  where id = 'c0000000-0000-0000-0000-000000000001';

  if v_tenant_id = 'a0000000-0000-0000-0000-000000000001'
     and v_auth_user_id = 'b0000000-0000-0000-0000-000000000001' then
    raise notice 'PASS: user profile linked to exactly one tenant and one auth identity';
  else
    raise exception 'FAIL: profile linkage wrong — tenant_id=%, auth_user_id=%', v_tenant_id, v_auth_user_id;
  end if;
end $$;
rollback to savepoint test16;

-- --------------------------------------------------------
-- Test 17: Role grants reference shared capability catalog
-- Covers: "Role grants reference shared capabilities" (authorization-base spec)
-- --------------------------------------------------------
\echo 'Test 17: Role grants reference shared capabilities'
savepoint test17;
do $$
declare
  v_count int;
begin
  insert into role_capabilities (role_id, capability_id)
  values (
    'e0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001'
  );

  select count(*) into v_count
  from role_capabilities rc
  join capabilities c on c.id = rc.capability_id
  join roles r on r.id = rc.role_id
  where rc.role_id = 'e0000000-0000-0000-0000-000000000001'
    and rc.capability_id = 'd0000000-0000-0000-0000-000000000001';

  if v_count = 1 then
    raise notice 'PASS: role grant references shared capability catalog';
  else
    raise exception 'FAIL: role grant did not reference shared capability (count=%)', v_count;
  end if;
end $$;
rollback to savepoint test17;

-- --------------------------------------------------------
-- Test 18: User override persisted separately from role grants
-- Covers: "User override can differ from role grants" (authorization-base spec)
-- --------------------------------------------------------
\echo 'Test 18: User override persisted separately from role grants'
savepoint test18;
do $$
declare
  v_override_count int;
  v_grant_count int;
begin
  -- Insert a role grant for capability d...0002
  insert into role_capabilities (role_id, capability_id)
  values (
    'e0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000002'
  );

  -- Insert a user override for the SAME capability with deny
  insert into user_capability_overrides (user_id, capability_id, grant_type)
  values (
    'c0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000002',
    'deny'
  );

  -- Verify override exists independently
  select count(*) into v_override_count
  from user_capability_overrides
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and capability_id = 'd0000000-0000-0000-0000-000000000002';

  -- Verify role grant exists separately
  select count(*) into v_grant_count
  from role_capabilities
  where role_id = 'e0000000-0000-0000-0000-000000000001'
    and capability_id = 'd0000000-0000-0000-0000-000000000002';

  if v_override_count = 1 and v_grant_count = 1 then
    raise notice 'PASS: user override persisted separately from role grants';
  else
    raise exception 'FAIL: override=% grant=% (expected 1, 1)', v_override_count, v_grant_count;
  end if;
end $$;
rollback to savepoint test18;

-- --------------------------------------------------------
-- Test 19: fuel_unit column schema, default, and NOT NULL
-- Covers: "fuel_unit is required as base tenant data" (infraestructura-base spec)
-- --------------------------------------------------------
\echo 'Test 19: fuel_unit column schema and default value'
savepoint test19;
do $$
declare
  v_default text;
  v_nullable text;
  v_data_type text;
begin
  select column_default, is_nullable, data_type
  into v_default, v_nullable, v_data_type
  from information_schema.columns
  where table_name = 'tenants' and column_name = 'fuel_unit' and table_schema = 'public';

  if v_default is null or v_default not like '%liters%' then
    raise exception 'FAIL: fuel_unit default wrong: %', v_default;
  end if;

  if v_nullable = 'YES' then
    raise exception 'FAIL: fuel_unit should be NOT NULL';
  end if;

  if v_data_type <> 'text' then
    raise exception 'FAIL: fuel_unit data type wrong: %', v_data_type;
  end if;

  raise notice 'PASS: fuel_unit has correct schema (text, NOT NULL, default liters)';
end $$;
rollback to savepoint test19;

-- --------------------------------------------------------
-- Test 20: Minimal audit record captures who, what, when
-- Covers: "Authorization change creates a minimal audit record" (authorization-base spec)
-- --------------------------------------------------------
\echo 'Test 20: Minimal audit record captures who, what, when'
savepoint test20;
do $$
declare
  v_id uuid;
  v_actor uuid;
  v_target uuid;
  v_action text;
  v_occurred timestamptz;
begin
  insert into audit_log (actor_user_id, target_user_id, action)
  values (
    'c0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000001',
    'override_created'
  )
  returning id, actor_user_id, target_user_id, action, occurred_at
  into v_id, v_actor, v_target, v_action, v_occurred;

  if v_id is not null
     and v_actor = 'c0000000-0000-0000-0000-000000000002'
     and v_target = 'c0000000-0000-0000-0000-000000000001'
     and v_action = 'override_created'
     and v_occurred is not null then
    raise notice 'PASS: audit record captures actor, target, action, occurred_at';
  else
    raise exception 'FAIL: audit record incomplete — id=% actor=% target=% action=% occurred=%',
      v_id, v_actor, v_target, v_action, v_occurred;
  end if;
end $$;
rollback to savepoint test20;

-- --------------------------------------------------------
-- Test 21: Email uniqueness uses trimmed canonical value
-- Covers: duplicate present emails with surrounding whitespace are rejected
-- --------------------------------------------------------
\echo 'Test 21: Duplicate email with surrounding whitespace rejected'
savepoint test21;
insert into auth.users (id, email, email_confirmed_at)
values ('b0000000-0000-0000-0000-000000000021', 'user21@test.com', now());
do $$
begin
  begin
    insert into user_profiles (tenant_id, auth_user_id, email)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000021',
      ' profile1@test.com  '
    );
    raise exception 'FAIL: duplicate trimmed email was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate trimmed email rejected';
  end;
end $$;
rollback to savepoint test21;

-- --------------------------------------------------------
-- Test 22: Phone uniqueness uses trimmed canonical value
-- Covers: duplicate present phones with surrounding whitespace are rejected
-- --------------------------------------------------------
\echo 'Test 22: Duplicate phone with surrounding whitespace rejected'
savepoint test22;
insert into auth.users (id, email, email_confirmed_at)
values ('b0000000-0000-0000-0000-000000000022', 'user22@test.com', now());
do $$
begin
  begin
    insert into user_profiles (tenant_id, auth_user_id, phone)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000022',
      ' +1111111111  '
    );
    raise exception 'FAIL: duplicate trimmed phone was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate trimmed phone rejected';
  end;
end $$;
rollback to savepoint test22;

-- --------------------------------------------------------
-- Test 23: Tenant role uniqueness uses trimmed canonical name
-- Covers: duplicate role names with surrounding whitespace are rejected per tenant
-- --------------------------------------------------------
\echo 'Test 23: Duplicate role name with surrounding whitespace rejected'
savepoint test23;
do $$
begin
  begin
    insert into roles (tenant_id, name)
    values ('a0000000-0000-0000-0000-000000000001', ' admin  ');
    raise exception 'FAIL: duplicate trimmed role name was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate trimmed role name rejected';
  end;
end $$;
rollback to savepoint test23;

-- --------------------------------------------------------
-- Test 24: Cross-tenant user role assignment rejected
-- Covers: user_roles must not assign a tenant A user to a tenant B role
-- --------------------------------------------------------
\echo 'Test 24: Cross-tenant user role assignment rejected'
savepoint test24;
insert into roles (id, tenant_id, name, is_system, is_web_access)
values (
  'e0000000-0000-0000-0000-000000000024',
  'a0000000-0000-0000-0000-000000000002',
  'cross-tenant-admin',
  false,
  true
);
do $$
begin
  begin
    insert into user_roles (tenant_id, user_id, role_id)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000024'
    );
    raise exception 'FAIL: cross-tenant user role assignment was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS: cross-tenant user role assignment rejected';
  end;
end $$;
rollback to savepoint test24;

\echo '=== All authorization constraint tests complete ==='

rollback;
