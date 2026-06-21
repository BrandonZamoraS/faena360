-- Verification for tenant-scoped expense category catalog (issue #47).
-- Run after creating migration: `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/categorias_gastos_catalog.sql`

\set ON_ERROR_STOP on

\echo '=== Expense categories catalog verification ==='

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
  ('22220000-0000-0000-0000-000000000002', 'tenant-b-user@test.com', now()),
  ('22220000-0000-0000-0000-000000000003', 'tenant-a-no-capability@test.com', now())
on conflict (id) do nothing;

insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values
  ('33330000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-000000000001', 'tenant-a-user@test.com', 'Alice Tenant A'),
  ('33330000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002', 'tenant-b-user@test.com', 'Bob Tenant B'),
  ('33330000-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000001', '22220000-0000-0000-0000-000000000003', 'tenant-a-no-capability@test.com', 'No Capability')
on conflict (id) do nothing;

set local role service_role;
insert into public.categorias_gastos (tenant_id, nombre, estado)
values
  ('11110000-0000-0000-0000-000000000001', 'Diésel', 'activo'),
  ('11110000-0000-0000-0000-000000000001', 'Nafta', 'oculto'),
  ('11110000-0000-0000-0000-000000000002', 'Kerosene', 'activo'),
  ('11110000-0000-0000-0000-000000000002', 'Gas Oil', 'activo')
on conflict do nothing;

insert into roles (id, tenant_id, name)
values
  ('44440000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'Expense Category Reader A'),
  ('44440000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001', 'Expense Category Manager A'),
  ('44440000-0000-0000-0000-000000000003', '11110000-0000-0000-0000-000000000002', 'Expense Category Reader B')
on conflict (id) do nothing;

-- Reader roles are read-only.
insert into role_capabilities (role_id, capability_id)
select '44440000-0000-0000-0000-000000000001', c.id
from capabilities c
where c.key = 'categories:read'
on conflict do nothing;

-- Manager role can read, create, and update.
insert into role_capabilities (role_id, capability_id)
select '44440000-0000-0000-0000-000000000002', c.id
from capabilities c
where c.key in ('categories:read', 'categories:create', 'categories:update')
on conflict do nothing;

insert into role_capabilities (role_id, capability_id)
select '44440000-0000-0000-0000-000000000003', c.id
from capabilities c
where c.key = 'categories:read'
on conflict do nothing;

insert into user_roles (tenant_id, user_id, role_id)
values
  ('11110000-0000-0000-0000-000000000001', '33330000-0000-0000-0000-000000000001', '44440000-0000-0000-0000-000000000001'),
  ('11110000-0000-0000-0000-000000000001', '33330000-0000-0000-0000-000000000001', '44440000-0000-0000-0000-000000000002'),
  ('11110000-0000-0000-0000-000000000002', '33330000-0000-0000-0000-000000000002', '44440000-0000-0000-0000-000000000003')
on conflict do nothing;

\echo '--- Test 1: Tenant A sees own active categories only (read only) ---'
savepoint cg_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.categorias_gastos
  where estado = 'activo';

  if v_count = 1 then
    raise notice 'PASS: tenant A sees only own active category rows';
  else
    raise exception 'FAIL: tenant A sees % active categories (expected 1)', v_count;
  end if;
end $$;

rollback to savepoint cg_test1;

\echo '--- Test 2: Tenant A without categories:read sees no categories ---'
savepoint cg_test2;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.categorias_gastos;

  if v_count = 0 then
    raise notice 'PASS: missing categories:read hides catalog data';
  else
    raise exception 'FAIL: user without categories:read saw % rows', v_count;
  end if;
end $$;

rollback to savepoint cg_test2;

\echo '--- Test 3: Tenant A does not see tenant B categories ---'
savepoint cg_test3;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.categorias_gastos
  where tenant_id = '11110000-0000-0000-0000-000000000002';

  if v_count = 0 then
    raise notice 'PASS: tenant isolation blocks cross-tenant reads';
  else
    raise exception 'FAIL: tenant A sees % rows for tenant B', v_count;
  end if;
end $$;

rollback to savepoint cg_test3;

\echo '--- Test 4: Tenant A cannot mutate tenant B rows (update/delete denied by RLS) ---'
savepoint cg_test4;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_updated int;
  v_deleted int;
begin
  update public.categorias_gastos
    set nombre = 'Hackeado'
    where tenant_id = '11110000-0000-0000-0000-000000000002';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise notice 'PASS: tenant A cannot update tenant B category rows';
  else
    raise exception 'FAIL: tenant A updated % tenant B rows', v_updated;
  end if;

  delete from public.categorias_gastos
    where tenant_id = '11110000-0000-0000-0000-000000000002';
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise notice 'PASS: tenant A cannot hard delete tenant B category rows';
  else
    raise exception 'FAIL: tenant A deleted % tenant B rows', v_deleted;
  end if;
end $$;

rollback to savepoint cg_test4;

\echo '--- Test 5: Active category name uniqueness is tenant-local ---'
savepoint cg_test5;
set local role service_role;

do $$
declare
  existing_name_id uuid;
  cross_tenant_name_id uuid;
  oculto_name_id uuid;
begin
  select id into existing_name_id
  from public.categorias_gastos
  where tenant_id = '11110000-0000-0000-0000-000000000001'
    and nombre = 'Diésel'
    and estado = 'activo'
  limit 1;

  if existing_name_id is null then
    raise exception 'FAIL: expected base active row for uniqueness check';
  end if;

  begin
    insert into public.categorias_gastos (tenant_id, nombre, estado)
    values ('11110000-0000-0000-0000-000000000001', 'Diésel', 'activo');
    raise exception 'FAIL: duplicate active category name accepted in same tenant';
  exception
    when unique_violation then
      raise notice 'PASS: duplicate active category name in same tenant rejected';
  end;

  insert into public.categorias_gastos (tenant_id, nombre, estado)
  values ('11110000-0000-0000-0000-000000000002', 'Diésel', 'activo')
  returning id into cross_tenant_name_id;
  raise notice 'PASS: same active name accepted in different tenant';

  update public.categorias_gastos
    set estado = 'oculto'
    where id = existing_name_id;

  insert into public.categorias_gastos (tenant_id, nombre, estado)
    values ('11110000-0000-0000-0000-000000000001', 'Diésel', 'activo')
    returning id into oculto_name_id;
  raise notice 'PASS: hidden category name can be reused in same tenant';

  delete from public.categorias_gastos where id in (cross_tenant_name_id, oculto_name_id);
end $$;

rollback to savepoint cg_test5;

\echo '--- Test 6: DB constraints reject missing nombre ---'
savepoint cg_test6;
set local role service_role;

do $$
begin
  begin
    insert into public.categorias_gastos (tenant_id, nombre)
    values ('11110000-0000-0000-0000-000000000001', null);
    raise exception 'FAIL: null nombre accepted';
  exception
    when not_null_violation then
      raise notice 'PASS: null nombre rejected by NOT NULL constraint';
  end;

  begin
    insert into public.categorias_gastos (tenant_id, nombre)
    values ('11110000-0000-0000-0000-000000000001', '   ');
    raise exception 'FAIL: blank nombre accepted';
  exception
    when check_violation then
      raise notice 'PASS: blank nombre rejected by trim/check constraint';
  end;
end $$;

rollback to savepoint cg_test6;

\echo '--- Test 7: Authenticated inserts/updates/deletes are denied directly ---'
savepoint cg_test7;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22220000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11110000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_count int;
begin
  begin
    insert into public.categorias_gastos (tenant_id, nombre)
      values ('11110000-0000-0000-0000-000000000001', 'No Permitido');
    raise exception 'FAIL: authenticated user inserted category';
  exception
    when insufficient_privilege then
      raise notice 'PASS: authenticated insert denied by policy';
  end;

  update public.categorias_gastos
    set descripcion = 'blocked'
    where tenant_id = '11110000-0000-0000-0000-000000000001'
      and nombre = 'Diésel';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise notice 'PASS: authenticated update denied by policy';
  else
    raise exception 'FAIL: authenticated user updated % rows', v_count;
  end if;

  delete from public.categorias_gastos
    where tenant_id = '11110000-0000-0000-0000-000000000001'
      and nombre = 'Diésel';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise notice 'PASS: authenticated hard delete denied by policy';
  else
    raise exception 'FAIL: authenticated user deleted % rows', v_count;
  end if;
end $$;

rollback to savepoint cg_test7;

\echo 'All expense category catalog checks passed.';

rollback;
