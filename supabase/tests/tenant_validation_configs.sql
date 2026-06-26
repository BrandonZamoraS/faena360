-- Verify tenant_validation_configs tenant isolation and uniqueness.
-- Usage: psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/tenant_validation_configs.sql

\set ON_ERROR_STOP on

\echo '=== Tenant Validation Configs Tests ==='

begin;

insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values
  ('a0000000-0000-0000-0000-000000000069', 'Tenant Validation A', 'tenant-validation-a', 'UTC', 'USD', 'active', 'liters'),
  ('a0000000-0000-0000-0000-000000000070', 'Tenant Validation B', 'tenant-validation-b', 'UTC', 'USD', 'active', 'liters');

insert into auth.users (id, email, email_confirmed_at)
values ('b0000000-0000-0000-0000-000000000069', 'validation-a@test.com', now())
on conflict (id) do nothing;

insert into user_profiles (id, tenant_id, auth_user_id, email, full_name)
values (
  'c0000000-0000-0000-0000-000000000069',
  'a0000000-0000-0000-0000-000000000069',
  'b0000000-0000-0000-0000-000000000069',
  'validation-a@test.com',
  'Validation A'
);

insert into capabilities (id, key, name, description)
values (
  'd0000000-0000-0000-0000-000000000069',
  'whatsapp.channel.access',
  'WhatsApp Channel Access',
  'Validation config test capability'
)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description;

insert into roles (id, tenant_id, name, is_system, is_web_access)
values (
  'e0000000-0000-0000-0000-000000000069',
  'a0000000-0000-0000-0000-000000000069',
  'operador',
  true,
  false
);

insert into role_capabilities (role_id, capability_id)
select
  'e0000000-0000-0000-0000-000000000069',
  c.id
from capabilities c
where c.key = 'whatsapp.channel.access';

insert into user_roles (tenant_id, user_id, role_id)
values (
  'a0000000-0000-0000-0000-000000000069',
  'c0000000-0000-0000-0000-000000000069',
  'e0000000-0000-0000-0000-000000000069'
);

insert into tenant_validation_configs (tenant_id, tipo, config)
values
  (
    'a0000000-0000-0000-0000-000000000069',
    'inicio_jornada',
    '{"campos":{"fotoHorometro":{"obligatorio":true}}}'::jsonb
  ),
  (
    'a0000000-0000-0000-0000-000000000070',
    'inicio_jornada',
    '{"campos":{"fotoHorometro":{"obligatorio":false}}}'::jsonb
  );

\echo 'Test 0: Service/admin inserts derive audit tenant_id from tenant_validation_configs rows'
savepoint tenant_validation_test0;

insert into tenant_validation_configs (tenant_id, tipo, config)
values (
  'a0000000-0000-0000-0000-000000000069',
  'cierre_jornada',
  '{"campos":{"fotoFinal":{"obligatorio":true}}}'::jsonb
);

do $$
declare
  v_tenant_id uuid;
begin
  select tenant_id
  into v_tenant_id
  from audit_log
  where action = 'tenant_validation_configs.create'
    and new_value ->> 'tipo' = 'cierre_jornada'
  order by occurred_at desc
  limit 1;

  if v_tenant_id = 'a0000000-0000-0000-0000-000000000069'::uuid then
    raise notice 'PASS: audit log captured tenant_validation_configs tenant_id without JWT context';
  else
    raise exception 'FAIL: audit log tenant_id was %, expected tenant A id', v_tenant_id;
  end if;
end $$;

rollback to savepoint tenant_validation_test0;

\echo 'Test 1: Unique (tenant_id, tipo) rejects duplicate rows'
savepoint tenant_validation_test1;

do $$
begin
  begin
    insert into tenant_validation_configs (tenant_id, tipo, config)
    values (
      'a0000000-0000-0000-0000-000000000069',
      'inicio_jornada',
      '{}'::jsonb
    );
    raise exception 'FAIL: duplicate validation config was accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate validation config rejected';
  end;
end $$;

rollback to savepoint tenant_validation_test1;

\echo 'Test 2: Authenticated tenant can only SELECT own validation config rows'
savepoint tenant_validation_test2;

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000069","app_metadata":{"tenant_id":"a0000000-0000-0000-0000-000000000069"}}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from tenant_validation_configs;
  if v_count = 1 then
    raise notice 'PASS: tenant A sees only its own validation config row';
  else
    raise exception 'FAIL: tenant A sees % validation config rows (expected 1)', v_count;
  end if;
end $$;

rollback to savepoint tenant_validation_test2;

rollback;
