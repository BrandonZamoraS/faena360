-- DB-level constraint verification for user profile status and inactive-user behavior.
--
-- Recommended run (after migration):
-- psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/authorization_constraints.sql

\set ON_ERROR_STOP on

\echo '=== Issue #20 Authorization Constraint Tests ==='

do $$
declare
  v_status_default text;
  v_exists_status boolean;
  v_has_status_check boolean;
begin
  if to_regclass('public.user_profiles') is null then
    raise exception 'FAIL: public.user_profiles is not present yet. Ensure migration 20250609000000_add_user_profile_status.sql was applied first.';
  end if;

  if to_regclass('public.tenants') is null then
    raise exception 'FAIL: public.tenants missing. Ensure tenant baseline migration runs first.';
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'FAIL: auth.users missing. Run Supabase migration baseline with Auth enabled.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'status'
  ) into v_exists_status;

  if not v_exists_status then
    raise exception 'FAIL: public.user_profiles.status missing.';
  end if;

  select column_default
    into v_status_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_profiles'
    and column_name = 'status';

  if v_status_default is null
     or v_status_default !~ 'active' then
    raise exception 'FAIL: user_profiles.status default is not active. Found: %', v_status_default;
  end if;

  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%active%'
      and pg_get_constraintdef(c.oid) ilike '%inactive%'
  ) into v_has_status_check;

  if not v_has_status_check then
    raise exception 'FAIL: no check constraint found for user_profiles.status active/inactive values.';
  end if;

  raise notice 'PASS: user_profiles.status default/check constraints are present.';

   -- Fixture setup for active/inactive user_profiles validation.
   insert into auth.users (id, email, email_confirmed_at)
   values
     ('e10000000-0000-0000-0000-000000000021', 'active-issue20@example.com', now()),
     ('e20000000-0000-0000-0000-000000000021', 'inactive-issue20@example.com', now()),
     ('e30000000-0000-0000-0000-000000000021', 'blocked-issue20@example.com', now())
   on conflict (id) do nothing;

   insert into public.tenants (id, name, slug, timezone, currency, status)
   values (
     'd00000000-0000-0000-0000-000000000021',
     'Issue 20 Tenant',
     'issue-20-tenant',
     'UTC',
     'USD',
     'active'
   )
   on conflict (id) do nothing;

   insert into public.user_profiles (
     id,
     tenant_id,
     auth_user_id,
     email,
     status
   )
   values (
     'd10000000-0000-0000-0000-000000000021',
     'd00000000-0000-0000-0000-000000000021',
     'e10000000-0000-0000-0000-000000000021',
     'active-issue20@example.com',
     default
   ),
   (
     'd20000000-0000-0000-0000-000000000021',
     'd00000000-0000-0000-0000-000000000021',
     'e20000000-0000-0000-0000-000000000021',
     'inactive-issue20@example.com',
     'inactive'
   )
   on conflict (id) do nothing;

   if not exists (
     select 1
     from public.user_profiles
     where id = 'd20000000-0000-0000-0000-000000000021'
       and status = 'inactive'
   ) then
     raise exception 'FAIL: inactive-profile fixture not inserted/retained.';
   end if;

   if not exists (
     select 1
     from public.user_profiles
     where id = 'd10000000-0000-0000-0000-000000000021'
       and status = 'active'
   ) then
     raise exception 'FAIL: active profile row with default status not found.';
   end if;

   -- Missing profile row should represent inactive_user in app logic.
   if exists (
     select 1 from public.user_profiles where id = 'd30000000-0000-0000-0000-000000000021'
   ) then
     raise exception 'FAIL: missing-profile fixture placeholder unexpectedly exists.';
   end if;

   begin
     insert into public.user_profiles (
       id,
       tenant_id,
       auth_user_id,
       email,
       status
     ) values (
       'd30000000-0000-0000-0000-000000000021',
       'd00000000-0000-0000-0000-000000000021',
       'e30000000-0000-0000-0000-000000000021',
       'blocked-issue20@example.com',
       'pending'
     );

     raise exception 'FAIL: invalid profile status was accepted.';
   exception
     when check_violation then
       raise notice 'PASS: invalid profile status rejected.';
     when others then
       raise exception 'FAIL: unexpected error during invalid status assertion. %', SQLERRM;
   end;

  raise notice 'PASS: inactive profile fixture assertions executed successfully.';
end $$;

\echo '=== Issue #20 Authorization Constraint Tests complete ==='
