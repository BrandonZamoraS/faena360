-- Client catalog verification.
-- Run after an explicit approval for Supabase commands:
--   supabase db reset
--   psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/clientes_catalog.sql

\set ON_ERROR_STOP on

\echo '=== Clientes Catalog Tests ==='

begin;

insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values
  ('aaaa1000-0000-0000-0000-000000000001', 'Tenant Clientes A', 'tenant-clientes-a', 'UTC', 'USD', 'active', 'liters'),
  ('aaaa1000-0000-0000-0000-000000000002', 'Tenant Clientes B', 'tenant-clientes-b', 'UTC', 'USD', 'active', 'liters');

insert into clientes (id, tenant_id, nombre, telefono, correo, identificacion, direccion, estado)
values
  ('cccc1000-0000-0000-0000-000000000001', 'aaaa1000-0000-0000-0000-000000000001', 'Cliente A Activo', '+598 111', 'a@example.com', 'A-1', 'Direccion A', 'activo'),
  ('cccc1000-0000-0000-0000-000000000002', 'aaaa1000-0000-0000-0000-000000000001', 'Cliente A Oculto', null, null, null, null, 'oculto'),
  ('cccc1000-0000-0000-0000-000000000003', 'aaaa1000-0000-0000-0000-000000000002', 'Cliente B Activo', null, null, null, null, 'activo');

\echo 'Test 1: Tenant A reads only own clients'
savepoint clientes_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_all int;
  v_active int;
  v_cross_tenant int;
begin
  select count(*) into v_all from clientes;
  select count(*) into v_active from clientes where estado = 'activo';
  select count(*) into v_cross_tenant from clientes where tenant_id = 'aaaa1000-0000-0000-0000-000000000002';

  if v_all <> 2 then
    raise exception 'FAIL: tenant A sees % clients, expected 2 own rows', v_all;
  end if;

  if v_active <> 1 then
    raise exception 'FAIL: active listing sees % rows, expected 1 active own row', v_active;
  end if;

  if v_cross_tenant <> 0 then
    raise exception 'FAIL: tenant A sees % tenant B clients, expected 0', v_cross_tenant;
  end if;
end $$;

rollback to savepoint clientes_test1;

\echo 'Test 2: Tenant A inserts only own-tenant clients'
savepoint clientes_test2;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

insert into clientes (tenant_id, nombre)
values ('aaaa1000-0000-0000-0000-000000000001', 'Cliente A Nuevo');

do $$
begin
  begin
    insert into clientes (tenant_id, nombre)
    values ('aaaa1000-0000-0000-0000-000000000002', 'Cliente Cross Tenant');
    raise exception 'FAIL: cross-tenant INSERT on clientes was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: cross-tenant INSERT on clientes denied';
  end;
end $$;

rollback to savepoint clientes_test2;

\echo 'Test 3: Missing nombre is rejected'
savepoint clientes_test3;

do $$
begin
  begin
    insert into clientes (tenant_id, nombre)
    values ('aaaa1000-0000-0000-0000-000000000001', '   ');
    raise exception 'FAIL: blank nombre was accepted';
  exception when check_violation then
    raise notice 'PASS: blank nombre rejected';
  end;
end $$;

rollback to savepoint clientes_test3;

\echo 'Test 4: Hide updates estado and keeps the row'
savepoint clientes_test4;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

update clientes
set estado = 'oculto'
where id = 'cccc1000-0000-0000-0000-000000000001';

do $$
declare
  v_hidden int;
  v_total int;
begin
  select count(*) into v_hidden from clientes where id = 'cccc1000-0000-0000-0000-000000000001' and estado = 'oculto';
  select count(*) into v_total from clientes where id = 'cccc1000-0000-0000-0000-000000000001';

  if v_hidden <> 1 or v_total <> 1 then
    raise exception 'FAIL: hide should update estado without deleting the row';
  end if;
end $$;

rollback to savepoint clientes_test4;

\echo 'Test 5: Authenticated users cannot hard-delete clientes'
savepoint clientes_test5;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_deleted int;
begin
  delete from clientes where id = 'cccc1000-0000-0000-0000-000000000001';
  get diagnostics v_deleted = row_count;

  if v_deleted <> 0 then
    raise exception 'FAIL: hard delete removed % clientes rows, expected 0', v_deleted;
  end if;
end $$;

rollback to savepoint clientes_test5;

\echo '=== Clientes Catalog Tests Complete ==='

rollback;
