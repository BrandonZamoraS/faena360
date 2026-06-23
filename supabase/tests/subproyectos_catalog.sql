-- Subproject catalog verification.
-- Run only with explicit approval and an existing database URL:
--   psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/subproyectos_catalog.sql

\set ON_ERROR_STOP on

\echo '=== Subproyectos Catalog Tests ==='

begin;

-- Ensure jornadas table exists for tests that reference it (existing projects tests depend on it).
do $$
begin
  if to_regclass('public.jornadas') is null then
    execute '
      create table public.jornadas (
        id uuid primary key,
        tenant_id uuid not null references public.tenants(id) on delete cascade,
        project_id uuid null references public.proyectos(id) on delete cascade,
        subproject_id uuid null references public.subproyectos(id) on delete cascade,
        estado text not null,
        motivo_anulacion text null
      )';
  end if;
end $$;

insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values
  ('aaaa3000-0000-0000-0000-000000000001', 'Tenant Subproyectos A', 'tenant-subproyectos-a', 'UTC', 'USD', 'active', 'liters'),
  ('aaaa3000-0000-0000-0000-000000000002', 'Tenant Subproyectos B', 'tenant-subproyectos-b', 'UTC', 'USD', 'active', 'liters');

insert into clientes (id, tenant_id, nombre, telefono, correo, identificacion, direccion, estado)
values
  ('cccc3000-0000-0000-0000-000000000001', 'aaaa3000-0000-0000-0000-000000000001', 'Cliente Activo SA', null, null, null, null, 'activo'),
  ('cccc3000-0000-0000-0000-000000000002', 'aaaa3000-0000-0000-0000-000000000002', 'Cliente Activo SB', null, null, null, null, 'activo');

insert into auth.users (id, email)
values
  ('bbbb3000-0000-0000-0000-000000000001', 'subproject-admin@example.com'),
  ('bbbb3000-0000-0000-0000-000000000002', 'subproject-supervisor@example.com'),
  ('bbbb3000-0000-0000-0000-000000000003', 'subproject-no-access@example.com')
on conflict (id) do nothing;

insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values
  ('bbbb3000-0000-0000-0000-000000000001', 'aaaa3000-0000-0000-0000-000000000001', 'bbbb3000-0000-0000-0000-000000000001', 'subproject-admin@example.com', 'Subproject Admin'),
  ('bbbb3000-0000-0000-0000-000000000002', 'aaaa3000-0000-0000-0000-000000000001', 'bbbb3000-0000-0000-0000-000000000002', 'subproject-supervisor@example.com', 'Subproject Supervisor'),
  ('bbbb3000-0000-0000-0000-000000000003', 'aaaa3000-0000-0000-0000-000000000001', 'bbbb3000-0000-0000-0000-000000000003', 'subproject-no-access@example.com', 'Subproject No Access');

insert into roles (id, tenant_id, name)
values
  ('dddd3000-0000-0000-0000-000000000001', 'aaaa3000-0000-0000-0000-000000000001', 'Subproject Admin'),
  ('dddd3000-0000-0000-0000-000000000002', 'aaaa3000-0000-0000-0000-000000000001', 'Subproject Supervisor');

insert into role_capabilities (role_id, capability_id)
select 'dddd3000-0000-0000-0000-000000000001', c.id
from capabilities c
where c.key in (
  'subprojects:read',
  'subprojects:create',
  'subprojects:update',
  'subprojects:finish',
  'subprojects:reopen',
  'subprojects:hide'
);

insert into role_capabilities (role_id, capability_id)
select 'dddd3000-0000-0000-0000-000000000002', c.id
from capabilities c
where c.key = 'subprojects:read';

insert into user_roles (tenant_id, user_id, role_id)
values
  ('aaaa3000-0000-0000-0000-000000000001', 'bbbb3000-0000-0000-0000-000000000001', 'dddd3000-0000-0000-0000-000000000001'),
  ('aaaa3000-0000-0000-0000-000000000002', 'bbbb3000-0000-0000-0000-000000000002', 'dddd3000-0000-0000-0000-000000000002');

insert into proyectos (id, tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, fecha_finalizacion, forma_cobro, monto_fijo, estado)
values
  ('eeee3000-0000-0000-0000-000000000001', 'aaaa3000-0000-0000-0000-000000000001', 'Proyecto Principal A', 'cccc3000-0000-0000-0000-000000000001', 'Sector Norte', '2026-06-01', null, 'monto_fijo', 1000, 'activo'),
  ('eeee3000-0000-0000-0000-000000000002', 'aaaa3000-0000-0000-0000-000000000001', 'Proyecto Finalizado A', 'cccc3000-0000-0000-0000-000000000001', 'Sector Sur', '2026-05-01', null, 'por_horas', null, 'finalizado'),
  ('eeee3000-0000-0000-0000-000000000003', 'aaaa3000-0000-0000-0000-000000000002', 'Proyecto Visible B', 'cccc3000-0000-0000-0000-000000000002', 'Sector Oeste', '2026-06-03', null, 'por_dia', null, 'activo');

-- Seed subprojects for tests that need existing state.
insert into subproyectos (id, tenant_id, proyecto_id, nombre, ubicacion, forma_cobro, monto_fijo, estado)
values
  ('ffff3000-0000-0000-0000-000000000001', 'aaaa3000-0000-0000-0000-000000000001', 'eeee3000-0000-0000-0000-000000000001', 'Fase 1 Existente', 'Sector Norte', 'monto_fijo', 400, 'activo'),
  ('ffff3000-0000-0000-0000-000000000002', 'aaaa3000-0000-0000-0000-000000000001', 'eeee3000-0000-0000-0000-000000000001', 'Fase 2 Existente', 'Sector Norte', 'monto_fijo', 400, 'activo'),
  ('ffff3000-0000-0000-0000-000000000003', 'aaaa3000-0000-0000-0000-000000000001', 'eeee3000-0000-0000-0000-000000000002', 'Sub Finalizado Parent', 'Sector Sur', 'por_horas', null, 'finalizado'),
  ('ffff3000-0000-0000-0000-000000000004', 'aaaa3000-0000-0000-0000-000000000001', 'eeee3000-0000-0000-0000-000000000001', 'Sub Oculto A', 'Sector Norte', 'por_horas', null, 'oculto');

---------------------------------------------------------------------
-- Test 1: Tenant isolation (RLS) — only own non-hidden subprojects
---------------------------------------------------------------------
\echo 'Test 1: RLS isolates tenant and hides ocultos in normal reads'
savepoint subproyectos_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb3000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa3000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_visible int;
  v_cross_tenant int;
begin
  select count(*) into v_visible from subproyectos;
  select count(*) into v_cross_tenant from subproyectos where tenant_id = 'aaaa3000-0000-0000-0000-000000000002';

  if v_visible <> 2 then
    raise exception 'FAIL: expected 2 visible tenant A subprojects, got %', v_visible;
  end if;

  if v_cross_tenant <> 0 then
    raise exception 'FAIL: tenant A saw % tenant B subprojects', v_cross_tenant;
  end if;
end $$;

rollback to savepoint subproyectos_test1;

---------------------------------------------------------------------
-- Test 2: create_subproyecto rejects cross-tenant proyecto_id
---------------------------------------------------------------------
\echo 'Test 2: create_subproyecto rejects cross-tenant proyecto_id'
savepoint subproyectos_test2;
set local role service_role;

do $$
declare
  v_created_id uuid;
begin
  -- Valid creation.
  select create_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'eeee3000-0000-0000-0000-000000000001',
    'Fase Nueva Valida'
  ) into v_created_id;

  if v_created_id is null then
    raise exception 'FAIL: create_subproyecto should return a subproject id';
  end if;

  -- Cross-tenant rejected.
  begin
    perform create_subproyecto(
      'bbbb3000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa3000-0000-0000-0000-000000000001',
      'eeee3000-0000-0000-0000-000000000003',
      'Fase Cross Tenant'
    );
    raise exception 'FAIL: cross-tenant proyecto_id was accepted';
  exception when others then
    if position('Referenced project must belong to the same tenant' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end $$;

rollback to savepoint subproyectos_test2;

---------------------------------------------------------------------
-- Test 3: Location and billing-form fall back to parent when omitted
---------------------------------------------------------------------
\echo 'Test 3: ubicacion and forma_cobro inherit from parent project'
savepoint subproyectos_test3;
set local role service_role;

do $$
declare
  v_created_id uuid;
  v_final_ubicacion text;
  v_final_forma_cobro text;
begin
  -- Create with defaults (no ubicacion/forma_cobro) — should inherit.
  select create_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'eeee3000-0000-0000-0000-000000000001',
    'Fase Heredada'
  ) into v_created_id;

  select ubicacion, forma_cobro
    into v_final_ubicacion, v_final_forma_cobro
  from subproyectos
  where id = v_created_id;

  if v_final_ubicacion <> 'Sector Norte' then
    raise exception 'FAIL: expected inherited ubicacion Sector Norte, got %', v_final_ubicacion;
  end if;

  if v_final_forma_cobro <> 'monto_fijo' then
    raise exception 'FAIL: expected inherited forma_cobro monto_fijo, got %', v_final_forma_cobro;
  end if;

  -- Create with explicit override.
  select create_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'eeee3000-0000-0000-0000-000000000001',
    'Fase Sobreescrita',
    'Sector Sur',
    'por_horas',
    0
  ) into v_created_id;

  select ubicacion, forma_cobro
    into v_final_ubicacion, v_final_forma_cobro
  from subproyectos
  where id = v_created_id;

  if v_final_ubicacion <> 'Sector Sur' then
    raise exception 'FAIL: expected explicit ubicacion Sector Sur, got %', v_final_ubicacion;
  end if;

  if v_final_forma_cobro <> 'por_horas' then
    raise exception 'FAIL: expected explicit forma_cobro por_horas, got %', v_final_forma_cobro;
  end if;
end $$;

rollback to savepoint subproyectos_test3;

---------------------------------------------------------------------
-- Test 4: monto_fijo required when forma_cobro = 'monto_fijo'
---------------------------------------------------------------------
\echo 'Test 4: monto_fijo constraint for forma_cobro monto_fijo'
savepoint subproyectos_test4;
set local role service_role;

do $$
begin
  -- Should reject: monto_fijo forma with null monto.
  begin
    perform create_subproyecto(
      'bbbb3000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa3000-0000-0000-0000-000000000001',
      'eeee3000-0000-0000-0000-000000000001',
      'Fase Sin Monto',
      null,
      'monto_fijo',
      null
    );
    raise exception 'FAIL: monto_fijo null was accepted for monto_fijo billing';
  exception when check_violation then
    raise notice 'PASS: monto_fijo required';
  end;
end $$;

rollback to savepoint subproyectos_test4;

---------------------------------------------------------------------
-- Test 5: Unique non-hidden name per tenant
---------------------------------------------------------------------
\echo 'Test 5: unique non-hidden name per tenant'
savepoint subproyectos_test5;
set local role service_role;

do $$
begin
  -- Duplicate visible name rejected.
  begin
    perform create_subproyecto(
      'bbbb3000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa3000-0000-0000-0000-000000000001',
      'eeee3000-0000-0000-0000-000000000001',
      '  fase 1 existente  '
    );
    raise exception 'FAIL: duplicate visible name was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate visible name rejected';
  end;

  -- Hide existing subproject, then same name allowed.
  if hide_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'ffff3000-0000-0000-0000-000000000001'
  ) is not true then
    raise exception 'FAIL: hide_subproyecto should hide the visible subproject';
  end if;

  perform create_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'eeee3000-0000-0000-0000-000000000001',
    'Fase 1 Existente'
  );
end $$;

rollback to savepoint subproyectos_test5;

---------------------------------------------------------------------
-- Test 6: Direct authenticated INSERT/UPDATE/DELETE denied
---------------------------------------------------------------------
\echo 'Test 6: direct authenticated mutations stay denied'
savepoint subproyectos_test6;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb3000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa3000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_updated int;
  v_deleted int;
begin
  begin
    insert into subproyectos (tenant_id, proyecto_id, nombre)
    values ('aaaa3000-0000-0000-0000-000000000001', 'eeee3000-0000-0000-0000-000000000001', 'Subproyecto Directo');
    raise exception 'FAIL: direct INSERT was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: direct INSERT denied';
  end;

  update subproyectos
  set nombre = 'Subproyecto Editado Directo'
  where id = 'ffff3000-0000-0000-0000-000000000002';

  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'FAIL: direct UPDATE changed % rows', v_updated;
  end if;

  delete from subproyectos where id = 'ffff3000-0000-0000-0000-000000000002';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'FAIL: direct DELETE changed % rows', v_deleted;
  end if;
end $$;

rollback to savepoint subproyectos_test6;

---------------------------------------------------------------------
-- Test 7: finish and reopen lifecycle transitions
---------------------------------------------------------------------
\echo 'Test 7: finish_subproyecto and reopen_subproyecto lifecycle'
savepoint subproyectos_test7;
set local role service_role;

do $$
declare
  v_estado text;
begin
  -- Finish active subproject.
  if finish_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'ffff3000-0000-0000-0000-000000000002',
    false,
    null
  ) is not true then
    raise exception 'FAIL: finish_subproyecto should succeed for active subproject';
  end if;

  select estado into v_estado
  from subproyectos
  where id = 'ffff3000-0000-0000-0000-000000000002';

  if v_estado <> 'finalizado' then
    raise exception 'FAIL: expected finalizado, got %', v_estado;
  end if;

  -- Reopen the finalized subproject.
  if reopen_subproyecto(
    'bbbb3000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa3000-0000-0000-0000-000000000001',
    'ffff3000-0000-0000-0000-000000000002',
    'pausado'
  ) is not true then
    raise exception 'FAIL: reopen_subproyecto should reopen a finalized subproject';
  end if;

  select estado into v_estado
  from subproyectos
  where id = 'ffff3000-0000-0000-0000-000000000002';

  if v_estado <> 'pausado' then
    raise exception 'FAIL: expected pausado after reopen, got %', v_estado;
  end if;
end $$;

rollback to savepoint subproyectos_test7;

---------------------------------------------------------------------
-- Test 8: reopen_subproyecto fails when parent is finalized
---------------------------------------------------------------------
\echo 'Test 8: reopen_subproyecto blocked by finalized parent project'
savepoint subproyectos_test8;
set local role service_role;

do $$
begin
  -- Subproject 'ffff3000-0000-0000-0000-000000000003' belongs to finalized parent 'eeee3000-0000-0000-0000-000000000002'.
  begin
    perform reopen_subproyecto(
      'bbbb3000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa3000-0000-0000-0000-000000000001',
      'ffff3000-0000-0000-0000-000000000003',
      'activo'
    );
    raise exception 'FAIL: reopen was allowed despite finalized parent';
  exception when others then
    if position('Cannot reopen subproject when parent project is finalized' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end $$;

rollback to savepoint subproyectos_test8;

---------------------------------------------------------------------
-- Test 9: User without subprojects:read capability sees zero rows
---------------------------------------------------------------------
\echo 'Test 9: capability-gated SELECT — user without subprojects:read'
savepoint subproyectos_test9;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb3000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa3000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_visible int;
begin
  select count(*) into v_visible from subproyectos;

  if v_visible <> 0 then
    raise exception 'FAIL: user without subprojects:read saw % subprojects', v_visible;
  end if;
end $$;

rollback to savepoint subproyectos_test9;

rollback;
