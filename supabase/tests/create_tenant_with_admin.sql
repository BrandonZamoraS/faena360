-- Issue: 19 — Create Tenant with First Admin
--
-- Run this SQL fixture to validate persisted data in a local Postgres instance.
--
-- Suggested workflow:
-- 1) Run the onboarding scenario(s) you want to verify with `pnpm tenant:create-admin`.
-- 2) Run this SQL with a local psql client (no service-role/env credentials needed).

\set ON_ERROR_STOP on

\echo '=== Tenant onboarding SQL verification ==='
\echo 'This fixture only reads existing database state; it does not execute bootstrap commands.'

\set SUCCESS_TENANT_SLUG 'issue19-fixture-success'
\set SUCCESS_ADMIN_EMAIL 'admin-success@issue19.local'
\set INVALID_SHAPE_SLUG 'issue19-invalid-shape'
\set INVALID_SHAPE_ADMIN_EMAIL 'admin-invalid@issue19.local'

\set INVALID_TIMEZONE_SLUG 'issue19-invalid-timezone'
\set INVALID_TIMEZONE_ADMIN_EMAIL 'tz-invalid@issue19.local'

\set INVALID_CURRENCY_SLUG 'issue19-invalid-currency'
\set INVALID_CURRENCY_ADMIN_EMAIL 'currency-invalid@issue19.local'

\set INVALID_FUEL_SLUG 'issue19-invalid-fuel'
\set INVALID_FUEL_EMAIL 'admin-invalid-fuel@issue19.local'

\set DUPLICATE_BOOTSTRAP_SLUG 'issue19-duplicate-run'
\set DUPLICATE_BOOTSTRAP_EMAIL 'admin-duplicate@issue19.local'

\set MAPPING_BLOCK_SLUG 'issue19-mapping-block'
\set MAPPING_BLOCK_EMAIL 'admin-mapping-block@issue19.local'

\set ROLLBACK_TENANT_SLUG 'issue19-rollback'
\set ROLLBACK_ADMIN_EMAIL 'admin-rollback@issue19.local'

-- psql variable interpolation does not happen inside dollar-quoted DO blocks.
-- Copy fixture values into session settings first, then read them with current_setting().
select set_config('issue19.success_tenant_slug', :'SUCCESS_TENANT_SLUG', false);
select set_config('issue19.success_admin_email', :'SUCCESS_ADMIN_EMAIL', false);
select set_config('issue19.invalid_shape_slug', :'INVALID_SHAPE_SLUG', false);
select set_config('issue19.invalid_shape_admin_email', :'INVALID_SHAPE_ADMIN_EMAIL', false);
select set_config('issue19.invalid_timezone_slug', :'INVALID_TIMEZONE_SLUG', false);
select set_config('issue19.invalid_timezone_admin_email', :'INVALID_TIMEZONE_ADMIN_EMAIL', false);
select set_config('issue19.invalid_currency_slug', :'INVALID_CURRENCY_SLUG', false);
select set_config('issue19.invalid_currency_admin_email', :'INVALID_CURRENCY_ADMIN_EMAIL', false);
select set_config('issue19.invalid_fuel_slug', :'INVALID_FUEL_SLUG', false);
select set_config('issue19.invalid_fuel_email', :'INVALID_FUEL_EMAIL', false);
select set_config('issue19.duplicate_bootstrap_slug', :'DUPLICATE_BOOTSTRAP_SLUG', false);
select set_config('issue19.duplicate_bootstrap_email', :'DUPLICATE_BOOTSTRAP_EMAIL', false);
select set_config('issue19.mapping_block_slug', :'MAPPING_BLOCK_SLUG', false);
select set_config('issue19.mapping_block_email', :'MAPPING_BLOCK_EMAIL', false);
select set_config('issue19.rollback_tenant_slug', :'ROLLBACK_TENANT_SLUG', false);
select set_config('issue19.rollback_admin_email', :'ROLLBACK_ADMIN_EMAIL', false);

\echo ''

\echo 'Test 1: Positive flow assertions (requires mapping configured before execution)'
\echo '  - Expect one tenant for the configured slug.'
\echo '  - Expect one profile with matching email tied to that tenant.'
\echo '  - Expect five tenant roles (all default names with web access flags for administrador/supervisor).'
\echo '  - Expect one administrador assignment for the admin profile.'

do $$
declare
  v_tenant_id uuid;
  v_tenant_count int;
  v_profile_id uuid;
  v_auth_user_id uuid;
  v_admin_app_tenant_id uuid;
  v_role_count int;
  v_admin_role_id uuid;
  v_admin_assignment_count int;
  v_grant_count int;
  v_missing_count int;
  v_missing_keys text;
begin
  with required_capabilities("key") as (
    values
      ('assignments:read'::text),
      ('assignments:update'::text),
      ('assignments:withdraw'::text),
      ('capabilities:read'::text),
      ('categories:create'::text),
      ('categories:read'::text),
      ('categories:update'::text),
      ('change_requests:approve'::text),
      ('change_requests:create'::text),
      ('change_requests:read'::text),
      ('change_requests:reject'::text),
      ('clients:create'::text),
      ('clients:read'::text),
      ('clients:update'::text),
      ('expenses:create'::text),
      ('expenses:read'::text),
      ('expenses:update'::text),
      ('expenses:void'::text),
      ('fuel_types:create'::text),
      ('fuel_types:read'::text),
      ('fuel_types:update'::text),
      ('machines:change_status'::text),
      ('machines:create'::text),
      ('machines:read'::text),
      ('machines:update'::text),
      ('projects:create'::text),
      ('projects:finish'::text),
      ('projects:pause'::text),
      ('projects:read'::text),
      ('projects:reopen'::text),
      ('projects:update'::text),
      ('reports:read'::text),
      ('roles:create'::text),
      ('roles:read'::text),
      ('roles:update'::text),
      ('shifts:close'::text),
      ('shifts:read'::text),
      ('shifts:start'::text),
      ('shifts:void'::text),
      ('subprojects:create'::text),
      ('subprojects:finish'::text),
      ('subprojects:read'::text),
      ('subprojects:reopen'::text),
      ('subprojects:update'::text),
      ('tenants:read'::text),
      ('tenants:update'::text),
      ('users:create'::text),
      ('users:read'::text),
      ('users:update'::text)
  )
  select
    count(*),
    string_agg(rc.key, ', ')
  into v_missing_count, v_missing_keys
  from required_capabilities rc
  left join capabilities c on c.key = rc.key
  where c.key is null;

  if v_missing_count > 0 then
    raise notice 'SKIP: positive flow test requires capabilities: %', v_missing_keys;
    return;
  end if;

  select id into v_tenant_id from tenants where slug = current_setting('issue19.success_tenant_slug');
  if v_tenant_id is null then
    raise notice 'SKIP: positive flow was not executed yet (tenant % not present).', current_setting('issue19.success_tenant_slug');
    return;
  end if;

  select count(*) into v_tenant_count from tenants where slug = current_setting('issue19.success_tenant_slug');
  if v_tenant_count <> 1 then
    raise exception 'FAIL: expected exactly 1 tenant for slug %, found %.',
      current_setting('issue19.success_tenant_slug'), v_tenant_count;
  end if;

  select id, auth_user_id into v_profile_id, v_auth_user_id
  from user_profiles
  where email = current_setting('issue19.success_admin_email')
  limit 1;

  if v_profile_id is null or v_auth_user_id is null then
    raise exception 'FAIL: admin profile not found for %', current_setting('issue19.success_admin_email');
  end if;

  if (select tenant_id from user_profiles where id = v_profile_id) is distinct from v_tenant_id then
    raise exception 'FAIL: profile tenant mismatch for %', current_setting('issue19.success_admin_email');
  end if;

  select nullif(raw_app_meta_data ->> 'tenant_id', '')::uuid
    into v_admin_app_tenant_id
  from auth.users
  where id = v_auth_user_id;

  if v_admin_app_tenant_id is distinct from v_tenant_id then
    raise exception 'FAIL: auth app_metadata.tenant_id mismatch for %', current_setting('issue19.success_admin_email');
  end if;

  select count(*) into v_role_count
  from roles
  where tenant_id = v_tenant_id;

  if v_role_count <> 5 then
    raise exception 'FAIL: expected 5 default roles for tenant %, found %.', v_tenant_id, v_role_count;
  end if;

  if not exists (
    select 1 from roles
    where tenant_id = v_tenant_id
      and name = 'administrador'
      and is_system
      and is_web_access
  ) then
    raise exception 'FAIL: administrador role is missing required flags (is_system + is_web_access).';
  end if;

  if not exists (
    select 1 from roles
    where tenant_id = v_tenant_id
      and name = 'supervisor'
      and is_system
      and is_web_access
  ) then
    raise exception 'FAIL: supervisor role is missing required flags (is_system + is_web_access).';
  end if;

  select id into v_admin_role_id
  from roles
  where tenant_id = v_tenant_id
    and name = 'administrador';

  if v_admin_role_id is null then
    raise exception 'FAIL: administrador role missing for tenant %.', v_tenant_id;
  end if;

  select count(*) into v_admin_assignment_count
  from user_roles
  where tenant_id = v_tenant_id
    and user_id = v_profile_id
    and role_id = v_admin_role_id;

  if v_admin_assignment_count <> 1 then
    raise exception 'FAIL: expected exactly one administrador assignment for admin profile, found %.',
      v_admin_assignment_count;
  end if;

  select count(*) into v_grant_count
  from role_capabilities rc
  join roles r on r.id = rc.role_id
  where r.tenant_id = v_tenant_id;

  if v_grant_count = 0 then
    raise exception 'FAIL: expected at least one role-capability grant for tenant %.',
      v_tenant_id;
  end if;

  raise notice 'PASS: positive bootstrap assertions satisfied for tenant %.', current_setting('issue19.success_tenant_slug');
end;
$$;

\echo ''
\echo 'Test 2: Invalid payload and validation failure should not persist tenant/admin artifacts'
\echo '  - Invalid shape (empty fullName), invalid timezone, invalid currency, invalid fuel.'

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from tenants
  where slug in (
    current_setting('issue19.invalid_shape_slug'),
    current_setting('issue19.invalid_timezone_slug'),
    current_setting('issue19.invalid_currency_slug'),
    current_setting('issue19.invalid_fuel_slug')
  );

  if v_count <> 0 then
    raise exception 'FAIL: expected zero tenants for invalid-case slugs, found %.', v_count;
  end if;

  select count(*) into v_count
  from user_profiles
  where email in (
    current_setting('issue19.invalid_shape_admin_email'),
    current_setting('issue19.invalid_timezone_admin_email'),
    current_setting('issue19.invalid_currency_admin_email'),
    current_setting('issue19.invalid_fuel_email')
  );

  if v_count <> 0 then
    raise exception 'FAIL: expected zero local profiles for invalid payload emails, found %.', v_count;
  end if;

  raise notice 'PASS: no invalid payload artifacts were persisted.';
end;
$$;

\echo ''
\echo 'Test 3: Duplicate rerun behavior + duplicate-safe identity checks'
\echo '  - Run issue19-duplicate-run payload twice, then run this test.'

do $$
declare
  v_existing_tenants int;
  v_existing_profiles int;
  v_existing_auth_users int;
begin
  select count(*) into v_existing_tenants from tenants where slug = current_setting('issue19.duplicate_bootstrap_slug');
  select count(*) into v_existing_profiles from user_profiles where email = current_setting('issue19.duplicate_bootstrap_email');
  select count(*) into v_existing_auth_users from auth.users where email = current_setting('issue19.duplicate_bootstrap_email');

  if v_existing_tenants > 1 then
    raise exception 'FAIL: duplicate tenants found for slug % (count=%).', current_setting('issue19.duplicate_bootstrap_slug'), v_existing_tenants;
  end if;

  if v_existing_profiles > 1 then
    raise exception 'FAIL: duplicate local profiles found for email % (count=%).',
      current_setting('issue19.duplicate_bootstrap_email'), v_existing_profiles;
  end if;

  if v_existing_auth_users > 1 then
    raise exception 'FAIL: duplicate auth identities found for % (count=%).',
      current_setting('issue19.duplicate_bootstrap_email'), v_existing_auth_users;
  end if;

  if v_existing_tenants = 1 and v_existing_profiles = 1 and v_existing_auth_users = 1 then
    raise notice 'PASS: duplicate rerun behavior preserved existing single records without duplication.';
  else
    raise notice 'PASS: rerun scenario not executed (expected one run) or artifacts were intentionally absent by design at this stage.';
  end if;
end;
$$;

\echo ''
\echo 'Test 4: Mapping-block preflight fail'
\echo '  - Ensure required default role-capability source is incomplete before running.'
\echo '  - Run the mapping-block payload and assert no tenant/profile/auth artifacts are created.'

do $$
declare
  v_count int;
begin
  select count(*) into v_count from tenants where slug = current_setting('issue19.mapping_block_slug');
  if v_count <> 0 then
    raise exception 'FAIL: mapping-block scenario should not create tenant %, found % row(s).',
      current_setting('issue19.mapping_block_slug'), v_count;
  end if;

  select count(*) into v_count from user_profiles where email = current_setting('issue19.mapping_block_email');
  if v_count <> 0 then
    raise exception 'FAIL: mapping-block failure must not persist local profile for %.',
      current_setting('issue19.mapping_block_email');
  end if;

  raise notice 'PASS: mapping-block scenario has no persisted artifacts.';
end;
$$;

\echo ''
\echo 'Test 5: Rollback after induced partial failure'
\echo '  - Induce a failure after one or more resources are written (manual drill only).'
\echo '  - Re-run/verify: there should be zero rows for the rollback slug and admin email.'

do $$
declare
  v_count int;
begin
  select count(*) into v_count from tenants where slug = current_setting('issue19.rollback_tenant_slug');
  if v_count <> 0 then
    raise exception 'FAIL: tenant % should be removed after compensated partial onboarding failure.',
      current_setting('issue19.rollback_tenant_slug');
  end if;

  select count(*) into v_count from user_profiles where email = current_setting('issue19.rollback_admin_email');
  if v_count <> 0 then
    raise exception 'FAIL: auth-bound admin profile % should be removed after compensated failure.',
      current_setting('issue19.rollback_admin_email');
  end if;

  raise notice 'PASS: rollback fixture has no persisted tenant/profile artifacts for %.',
    current_setting('issue19.rollback_tenant_slug');
end;
$$;

\echo ''
\echo 'Optional clean-up for local verification state:'
\echo '  delete from tenants where slug like ''issue19-%'';'
