-- Project catalog verification.
-- Run only with explicit approval and an existing database URL:
--   psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/proyectos_catalog.sql

\set ON_ERROR_STOP on

\echo '=== Proyectos Catalog Tests ==='

begin;

do $$
begin
  if to_regclass('public.subproyectos') is null then
    execute '
      create table public.subproyectos (
        id uuid primary key,
        tenant_id uuid not null references public.tenants(id) on delete cascade,
        proyecto_id uuid not null references public.proyectos(id) on delete cascade,
        estado text not null default ''activo'',
        fecha_finalizacion date null
      )';
  end if;

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
  ('aaaa2000-0000-0000-0000-000000000001', 'Tenant Proyectos A', 'tenant-proyectos-a', 'UTC', 'USD', 'active', 'liters'),
  ('aaaa2000-0000-0000-0000-000000000002', 'Tenant Proyectos B', 'tenant-proyectos-b', 'UTC', 'USD', 'active', 'liters');

insert into clientes (id, tenant_id, nombre, telefono, correo, identificacion, direccion, estado)
values
  ('cccc2000-0000-0000-0000-000000000001', 'aaaa2000-0000-0000-0000-000000000001', 'Cliente Activo A', null, null, null, null, 'activo'),
  ('cccc2000-0000-0000-0000-000000000002', 'aaaa2000-0000-0000-0000-000000000001', 'Cliente Oculto A', null, null, null, null, 'oculto'),
  ('cccc2000-0000-0000-0000-000000000003', 'aaaa2000-0000-0000-0000-000000000002', 'Cliente Activo B', null, null, null, null, 'activo');

insert into auth.users (id, email)
values
  ('bbbb2000-0000-0000-0000-000000000001', 'project-admin@example.com'),
  ('bbbb2000-0000-0000-0000-000000000002', 'project-supervisor@example.com'),
  ('bbbb2000-0000-0000-0000-000000000003', 'project-no-access@example.com')
on conflict (id) do nothing;

insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values
  ('bbbb2000-0000-0000-0000-000000000001', 'aaaa2000-0000-0000-0000-000000000001', 'bbbb2000-0000-0000-0000-000000000001', 'project-admin@example.com', 'Project Admin'),
  ('bbbb2000-0000-0000-0000-000000000002', 'aaaa2000-0000-0000-0000-000000000001', 'bbbb2000-0000-0000-0000-000000000002', 'project-supervisor@example.com', 'Project Supervisor'),
  ('bbbb2000-0000-0000-0000-000000000003', 'aaaa2000-0000-0000-0000-000000000001', 'bbbb2000-0000-0000-0000-000000000003', 'project-no-access@example.com', 'Project No Access');

insert into roles (id, tenant_id, name)
values
  ('dddd2000-0000-0000-0000-000000000001', 'aaaa2000-0000-0000-0000-000000000001', 'Project Admin'),
  ('dddd2000-0000-0000-0000-000000000002', 'aaaa2000-0000-0000-0000-000000000001', 'Project Supervisor');

insert into role_capabilities (role_id, capability_id)
select 'dddd2000-0000-0000-0000-000000000001', c.id
from capabilities c
where c.key in (
  'projects:read',
  'projects:create',
  'projects:update',
  'projects:pause',
  'projects:finish',
  'projects:reopen',
  'projects:hide'
);

insert into role_capabilities (role_id, capability_id)
select 'dddd2000-0000-0000-0000-000000000002', c.id
from capabilities c
where c.key = 'projects:read';

insert into user_roles (tenant_id, user_id, role_id)
values
  ('aaaa2000-0000-0000-0000-000000000001', 'bbbb2000-0000-0000-0000-000000000001', 'dddd2000-0000-0000-0000-000000000001'),
  ('aaaa2000-0000-0000-0000-000000000001', 'bbbb2000-0000-0000-0000-000000000002', 'dddd2000-0000-0000-0000-000000000002');

insert into proyectos (id, tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, fecha_finalizacion, forma_cobro, monto_fijo, estado)
values
  ('eeee2000-0000-0000-0000-000000000001', 'aaaa2000-0000-0000-0000-000000000001', 'Proyecto Visible A', 'cccc2000-0000-0000-0000-000000000001', 'Sector Norte', '2026-06-01', null, 'monto_fijo', 900, 'activo'),
  ('eeee2000-0000-0000-0000-000000000002', 'aaaa2000-0000-0000-0000-000000000001', 'Proyecto Oculto A', 'cccc2000-0000-0000-0000-000000000001', 'Sector Sur', '2026-06-02', null, 'por_horas', null, 'oculto'),
  ('eeee2000-0000-0000-0000-000000000003', 'aaaa2000-0000-0000-0000-000000000002', 'Proyecto Visible B', 'cccc2000-0000-0000-0000-000000000003', 'Sector Oeste', '2026-06-03', null, 'por_dia', null, 'activo');

insert into subproyectos (id, tenant_id, proyecto_id)
values ('ffff2000-0000-0000-0000-000000000001', 'aaaa2000-0000-0000-0000-000000000001', 'eeee2000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

\echo 'Test 1: RLS isolates tenant and hides ocultos in normal reads'
savepoint proyectos_test1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa2000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_visible int;
  v_cross_tenant int;
begin
  select count(*) into v_visible from proyectos;
  select count(*) into v_cross_tenant from proyectos where tenant_id = 'aaaa2000-0000-0000-0000-000000000002';

  if v_visible <> 1 then
    raise exception 'FAIL: expected 1 visible tenant A project, got %', v_visible;
  end if;

  if v_cross_tenant <> 0 then
    raise exception 'FAIL: tenant A saw % tenant B projects', v_cross_tenant;
  end if;
end $$;

rollback to savepoint proyectos_test1;

\echo 'Test 2: create_proyecto requires active same-tenant client'
savepoint proyectos_test2;
set local role service_role;

do $$
declare
  v_created_id uuid;
begin
  select create_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'Proyecto Nuevo A',
    'cccc2000-0000-0000-0000-000000000001',
    'Nuevo sector',
    '2026-06-10',
    'por_horas',
    null
  ) into v_created_id;

  if v_created_id is null then
    raise exception 'FAIL: create_proyecto should return a project id';
  end if;

  begin
    perform create_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      'Proyecto Cliente Otro Tenant',
      'cccc2000-0000-0000-0000-000000000003',
      'Cruce tenant',
      '2026-06-11',
      'por_horas',
      null
    );
    raise exception 'FAIL: cross-tenant client was accepted';
  exception when others then
    if position('Referenced client is missing or not active for this tenant' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform create_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      'Proyecto Cliente Inactivo',
      'cccc2000-0000-0000-0000-000000000002',
      'Cliente oculto',
      '2026-06-11',
      'por_horas',
      null
    );
    raise exception 'FAIL: inactive client was accepted';
  exception when others then
    if position('Referenced client is missing or not active for this tenant' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end $$;

rollback to savepoint proyectos_test2;

\echo 'Test 3: ubicacion and monto_fijo are required by constraints'
savepoint proyectos_test3;
set local role service_role;

do $$
begin
  begin
    perform create_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      'Proyecto Sin Ubicacion',
      'cccc2000-0000-0000-0000-000000000001',
      '   ',
      '2026-06-12',
      'por_horas',
      null
    );
    raise exception 'FAIL: blank ubicacion was accepted';
  exception when check_violation then
    raise notice 'PASS: blank ubicacion rejected';
  end;

  begin
    perform create_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      'Proyecto Sin Monto',
      'cccc2000-0000-0000-0000-000000000001',
      'Sector monto',
      '2026-06-12',
      'monto_fijo',
      null
    );
    raise exception 'FAIL: monto_fijo null was accepted for monto_fijo';
  exception when check_violation then
    raise notice 'PASS: monto_fijo required';
  end;
end $$;

rollback to savepoint proyectos_test3;

\echo 'Test 4: non-hidden project names are unique per tenant'
savepoint proyectos_test4;
set local role service_role;

do $$
begin
  begin
    perform create_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      '  proyecto visible a  ',
      'cccc2000-0000-0000-0000-000000000001',
      'Sector duplicado',
      '2026-06-13',
      'por_dia',
      null
    );
    raise exception 'FAIL: duplicate visible name was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate visible name rejected';
  end;

  if hide_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000001'
  ) is not true then
    raise exception 'FAIL: hide_proyecto should hide the visible project';
  end if;

  perform create_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'Proyecto Visible A',
    'cccc2000-0000-0000-0000-000000000001',
    'Reuso nombre oculto',
    '2026-06-13',
    'por_dia',
    null
  );
end $$;

rollback to savepoint proyectos_test4;

\echo 'Test 5: direct authenticated mutations stay denied'
savepoint proyectos_test5;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2000-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"aaaa2000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_updated int;
  v_deleted int;
begin
  begin
    insert into proyectos (tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, forma_cobro)
    values ('aaaa2000-0000-0000-0000-000000000001', 'Proyecto Directo', 'cccc2000-0000-0000-0000-000000000001', 'Directo', '2026-06-14', 'por_horas');
    raise exception 'FAIL: direct INSERT was accepted';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: direct INSERT denied';
  end;

  update proyectos
  set nombre = 'Proyecto Editado Directo'
  where id = 'eeee2000-0000-0000-0000-000000000001';

  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'FAIL: direct UPDATE changed % rows', v_updated;
  end if;

  delete from proyectos where id = 'eeee2000-0000-0000-0000-000000000001';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'FAIL: direct DELETE changed % rows', v_deleted;
  end if;
end $$;

rollback to savepoint proyectos_test5;

\echo 'Test 6: lifecycle transitions work with matching capabilities'
savepoint proyectos_test6;
set local role service_role;

do $$
begin
  if pause_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000001',
    false,
    null
  ) is not true then
    raise exception 'FAIL: pause_proyecto should succeed for active project';
  end if;

  if finish_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000001',
    false,
    null
  ) is not true then
    raise exception 'FAIL: finish_proyecto should succeed for paused project';
  end if;

  if reopen_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000001',
    'pausado'
  ) is not true then
    raise exception 'FAIL: reopen_proyecto should reopen a finalized project';
  end if;

  if hide_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000001'
  ) is not true then
    raise exception 'FAIL: hide_proyecto should hide a tenant project';
  end if;
end $$;

rollback to savepoint proyectos_test6;

\echo 'Test 7: forced pause/finalize require reason and invalidate open jornadas'
savepoint proyectos_test7;
set local role service_role;

insert into proyectos (id, tenant_id, nombre, cliente_id, ubicacion, fecha_inicio, forma_cobro, monto_fijo, estado)
values
  ('eeee2000-0000-0000-0000-000000000010', 'aaaa2000-0000-0000-0000-000000000001', 'Proyecto Forzado Pausa', 'cccc2000-0000-0000-0000-000000000001', 'Sector Forzado', '2026-06-20', 'por_horas', null, 'activo'),
  ('eeee2000-0000-0000-0000-000000000011', 'aaaa2000-0000-0000-0000-000000000001', 'Proyecto Forzado Fin', 'cccc2000-0000-0000-0000-000000000001', 'Sector Forzado Fin', '2026-06-20', 'por_dia', null, 'activo');

insert into subproyectos (id, tenant_id, proyecto_id, estado)
values ('ffff2000-0000-0000-0000-000000000010', 'aaaa2000-0000-0000-0000-000000000001', 'eeee2000-0000-0000-0000-000000000011', 'activo')
on conflict (id) do nothing;

insert into jornadas (id, tenant_id, project_id, subproject_id, estado, motivo_anulacion)
values
  ('99992000-0000-0000-0000-000000000001', 'aaaa2000-0000-0000-0000-000000000001', 'eeee2000-0000-0000-0000-000000000010', null, 'abierta', null),
  ('99992000-0000-0000-0000-000000000002', 'aaaa2000-0000-0000-0000-000000000001', null, 'ffff2000-0000-0000-0000-000000000010', 'abierta', null);

do $$
declare
  v_annulled int;
  v_finalized_subprojects int;
begin
  begin
    perform pause_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      'eeee2000-0000-0000-0000-000000000010',
      false,
      null
    );
    raise exception 'FAIL: pause without force should block open jornadas';
  exception when others then
    if position('open jornadas' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform pause_proyecto(
      'bbbb2000-0000-0000-0000-000000000001',
      'sql-test',
      'aaaa2000-0000-0000-0000-000000000001',
      'eeee2000-0000-0000-0000-000000000010',
      true,
      '   '
    );
    raise exception 'FAIL: force pause without reason should fail';
  exception when others then
    if position('requires a reason' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  if pause_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000010',
    true,
    'Cierre administrativo por jornadas abiertas'
  ) is not true then
    raise exception 'FAIL: force pause should succeed with reason';
  end if;

  select count(*) into v_annulled
  from jornadas
  where project_id = 'eeee2000-0000-0000-0000-000000000010'
    and estado = 'anulada'
    and motivo_anulacion = 'Cierre administrativo por jornadas abiertas';

  if v_annulled <> 1 then
    raise exception 'FAIL: forced pause should annul 1 direct jornada, got %', v_annulled;
  end if;

  if finish_proyecto(
    'bbbb2000-0000-0000-0000-000000000001',
    'sql-test',
    'aaaa2000-0000-0000-0000-000000000001',
    'eeee2000-0000-0000-0000-000000000011',
    true,
    'Finalización administrativa por jornadas abiertas'
  ) is not true then
    raise exception 'FAIL: force finish should succeed with reason';
  end if;

  select count(*) into v_annulled
  from jornadas
  where subproject_id = 'ffff2000-0000-0000-0000-000000000010'
    and estado = 'anulada'
    and motivo_anulacion = 'Finalización administrativa por jornadas abiertas';

  if v_annulled <> 1 then
    raise exception 'FAIL: forced finish should annul 1 subproject jornada, got %', v_annulled;
  end if;

  select count(*) into v_finalized_subprojects
  from subproyectos
  where id = 'ffff2000-0000-0000-0000-000000000010'
    and estado = 'finalizado';

  if v_finalized_subprojects <> 1 then
    raise exception 'FAIL: forced finish should finalize related subprojects, got %', v_finalized_subprojects;
  end if;
end $$;

rollback to savepoint proyectos_test7;

\echo 'Test 8: users without projects:read cannot see rows'
savepoint proyectos_test8;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2000-0000-0000-0000-000000000003","app_metadata":{"tenant_id":"aaaa2000-0000-0000-0000-000000000001"}}';

do $$
declare
  v_visible int;
begin
  select count(*) into v_visible from proyectos;

  if v_visible <> 0 then
    raise exception 'FAIL: user without projects:read saw % projects', v_visible;
  end if;
end $$;

rollback to savepoint proyectos_test8;

rollback;
