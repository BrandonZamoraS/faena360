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

insert into auth.users (id, email)
values
  ('bbbb1000-0000-0000-0000-000000000001', 'client-reader@example.com'),
  ('bbbb1000-0000-0000-0000-000000000002', 'client-no-capability@example.com'),
  ('bbbb1000-0000-0000-0000-000000000003', 'client-writer@example.com')
on conflict (id) do nothing;

insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values
  ('bbbb1000-0000-0000-0000-000000000001', 'aaaa1000-0000-0000-0000-000000000001', 'bbbb1000-0000-0000-0000-000000000001', 'client-reader@example.com', 'Client Reader'),
  ('bbbb1000-0000-0000-0000-000000000002', 'aaaa1000-0000-0000-0000-000000000001', 'bbbb1000-0000-0000-0000-000000000002', 'client-no-capability@example.com', 'No Capability'),
  ('bbbb1000-0000-0000-0000-000000000003', 'aaaa1000-0000-0000-0000-000000000001', 'bbbb1000-0000-0000-0000-000000000003', 'client-writer@example.com', 'Client Writer');

insert into roles (id, tenant_id, name)
values
  ('dddd1000-0000-0000-0000-000000000001', 'aaaa1000-0000-0000-0000-000000000001', 'Client Reader'),
  ('dddd1000-0000-0000-0000-000000000002', 'aaaa1000-0000-0000-0000-000000000001', 'Client Writer');

insert into role_capabilities (role_id, capability_id)
select 'dddd1000-0000-0000-0000-000000000001', c.id
from capabilities c
where c.key = 'clients:read';

insert into role_capabilities (role_id, capability_id)
select 'dddd1000-0000-0000-0000-000000000002', c.id
from capabilities c
where c.key in ('clients:read', 'clients:create', 'clients:update');

insert into user_roles (tenant_id, user_id, role_id)
values
  ('aaaa1000-0000-0000-0000-000000000001', 'bbbb1000-0000-0000-0000-000000000001', 'dddd1000-0000-0000-0000-000000000001'),
  ('aaaa1000-0000-0000-0000-000000000001', 'bbbb1000-0000-0000-0000-000000000003', 'dddd1000-0000-0000-0000-000000000002');

\echo 'Test 1: Tenant A reads only own clients'
savepoint clientes_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

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

\echo 'Test 2: Tenant A creates clients through RPC only'
savepoint clientes_test2;
set local role service_role;

do $$
declare
  v_created_id uuid;
begin
  select create_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'Cliente A Nuevo'
  ) into v_created_id;

  if v_created_id is null then
    raise exception 'FAIL: create_cliente should return the new client id';
  end if;

  begin
    perform create_cliente(
      'bbbb1000-0000-0000-0000-000000000003',
      'web',
      'aaaa1000-0000-0000-0000-000000000002',
      'Cliente Cross Tenant'
    );
    raise exception 'FAIL: cross-tenant create_cliente was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS: cross-tenant create_cliente denied';
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

do $$
begin
  begin
    insert into clientes (tenant_id, nombre)
    values ('aaaa1000-0000-0000-0000-000000000001', 'Cliente Directo');
    raise exception 'FAIL: direct INSERT with clients:create was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: direct INSERT with clients:create denied';
  end;
end $$;

rollback to savepoint clientes_test2;

\echo 'Test 3: Missing nombre is rejected'
savepoint clientes_test3;
set local role service_role;

do $$
begin
  begin
    perform create_cliente(
      'bbbb1000-0000-0000-0000-000000000003',
      'web',
      'aaaa1000-0000-0000-0000-000000000001',
      '   '
    );
    raise exception 'FAIL: blank nombre was accepted';
  exception when check_violation then
    raise notice 'PASS: blank nombre rejected';
  end;
end $$;

rollback to savepoint clientes_test3;

\echo 'Test 4: Hide updates estado and keeps the row'
savepoint clientes_test4;
set local role service_role;

do $$
declare
  v_hidden_result boolean;
  v_hidden int;
  v_total int;
begin
  select hide_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'cccc1000-0000-0000-0000-000000000001'
  ) into v_hidden_result;

  if v_hidden_result is not true then
    raise exception 'FAIL: hide_cliente should return true for an existing tenant client';
  end if;

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

\echo 'Test 6: Authenticated users without clients:read cannot bypass app guards'
savepoint clientes_test6;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000002","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_visible int;
begin
  select count(*) into v_visible from clientes;

  if v_visible <> 0 then
    raise exception 'FAIL: user without clients:read saw % clientes rows', v_visible;
  end if;
end $$;

rollback to savepoint clientes_test6;

\echo 'Test 7: Authenticated users with clients:create cannot insert directly'
savepoint clientes_test7;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

do $$
begin
  begin
    insert into clientes (tenant_id, nombre)
    values ('aaaa1000-0000-0000-0000-000000000001', 'Cliente Con Create');
    raise exception 'FAIL: direct INSERT with clients:create was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: direct INSERT with clients:create denied';
  end;
end $$;

rollback to savepoint clientes_test7;

\echo 'Test 8: Authenticated users with clients:update cannot update directly'
savepoint clientes_test8;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb1000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa1000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_updated int;
begin
  update clientes
  set nombre = 'Cliente Con Update'
  where id = 'cccc1000-0000-0000-0000-000000000001';

  get diagnostics v_updated = row_count;

  if v_updated <> 0 then
    raise exception 'FAIL: direct UPDATE with clients:update affected % rows', v_updated;
  end if;
end $$;

rollback to savepoint clientes_test8;

\echo 'Test 9: Client audit captures actor/source and changed fields only on UPDATE'
savepoint clientes_test9;
set local role service_role;

do $$
declare
  v_updated boolean;
begin
  select update_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'cccc1000-0000-0000-0000-000000000001',
    'Cliente A Auditado',
    '+598 111',
    'a@example.com',
    'A-1',
    'Direccion A'
  ) into v_updated;

  if v_updated is not true then
    raise exception 'FAIL: update_cliente should return true for an existing tenant client';
  end if;
end $$;

do $$
declare
  v_entry record;
begin
  select * into v_entry
  from audit_log
  where action = 'cliente.update'
  order by occurred_at desc
  limit 1;

  if not found then
    raise exception 'FAIL: expected cliente.update audit entry';
  end if;

  if v_entry.actor_user_id is distinct from 'bbbb1000-0000-0000-0000-000000000003'::uuid then
    raise exception 'FAIL: audit actor mismatch, got %', v_entry.actor_user_id;
  end if;

  if v_entry.source is distinct from 'web' then
    raise exception 'FAIL: audit source mismatch, got %', v_entry.source;
  end if;

  if v_entry.old_value is distinct from jsonb_build_object('nombre', 'Cliente A Activo') then
    raise exception 'FAIL: audit UPDATE old_value mismatch, got %', v_entry.old_value;
  end if;

  if v_entry.new_value is distinct from jsonb_build_object('nombre', 'Cliente A Auditado') then
    raise exception 'FAIL: audit UPDATE new_value mismatch, got %', v_entry.new_value;
  end if;

  if v_entry.old_value ? 'tenant_id' or v_entry.new_value ? 'tenant_id' or v_entry.old_value ? 'telefono' or v_entry.new_value ? 'telefono' then
    raise exception 'FAIL: audit UPDATE diff included unchanged fields';
  end if;
end $$;

rollback to savepoint clientes_test9;

\echo 'Test 10: Client mutation RPCs enforce allow and deny capability overrides'
savepoint clientes_test10;
set local role service_role;

do $$
declare
  v_created_id uuid;
begin
  insert into user_capability_overrides (user_id, tenant_id, capability_id, grant_type)
  select
    'bbbb1000-0000-0000-0000-000000000002',
    'aaaa1000-0000-0000-0000-000000000001',
    c.id,
    'allow'
  from capabilities c
  where c.key = 'clients:create';

  select create_cliente(
    'bbbb1000-0000-0000-0000-000000000002',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'Cliente Allow Override'
  ) into v_created_id;

  if v_created_id is null then
    raise exception 'FAIL: allow override should permit create_cliente';
  end if;

  insert into user_capability_overrides (user_id, tenant_id, capability_id, grant_type)
  select
    'bbbb1000-0000-0000-0000-000000000003',
    'aaaa1000-0000-0000-0000-000000000001',
    c.id,
    'deny'
  from capabilities c
  where c.key = 'clients:update';

  begin
    perform hide_cliente(
      'bbbb1000-0000-0000-0000-000000000003',
      'web',
      'aaaa1000-0000-0000-0000-000000000001',
      'cccc1000-0000-0000-0000-000000000001'
    );
    raise exception 'FAIL: deny override should take precedence over role-granted clients:update';
  exception when insufficient_privilege then
    raise notice 'PASS: deny override blocks role-granted clients:update';
  end;
end $$;

rollback to savepoint clientes_test10;

\echo 'Test 11: Client mutation RPCs return false for missing or cross-tenant targets'
savepoint clientes_test11;
set local role service_role;

do $$
declare
  v_updated boolean;
  v_hidden boolean;
begin
  select update_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'cccc1000-0000-0000-0000-000000009999',
    'Cliente Inexistente'
  ) into v_updated;

  if v_updated is not false then
    raise exception 'FAIL: update_cliente should return false for a missing client';
  end if;

  select update_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'cccc1000-0000-0000-0000-000000000003',
    'Cliente Cross Tenant'
  ) into v_updated;

  if v_updated is not false then
    raise exception 'FAIL: update_cliente should return false for a cross-tenant client';
  end if;

  select hide_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'cccc1000-0000-0000-0000-000000009999'
  ) into v_hidden;

  if v_hidden is not false then
    raise exception 'FAIL: hide_cliente should return false for a missing client';
  end if;

  select hide_cliente(
    'bbbb1000-0000-0000-0000-000000000003',
    'web',
    'aaaa1000-0000-0000-0000-000000000001',
    'cccc1000-0000-0000-0000-000000000003'
  ) into v_hidden;

  if v_hidden is not false then
    raise exception 'FAIL: hide_cliente should return false for a cross-tenant client';
  end if;
end $$;

rollback to savepoint clientes_test11;

\echo '=== Clientes Catalog Tests Complete ==='

rollback;
