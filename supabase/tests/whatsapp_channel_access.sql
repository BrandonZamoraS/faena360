-- Verify WhatsApp channel access backfill is scoped to system roles safely.
-- Usage: psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/whatsapp_channel_access.sql

\set ON_ERROR_STOP on

\echo '=== WhatsApp Channel Access Backfill Tests ==='

begin;

insert into tenants (id, name, slug, timezone, currency, status, fuel_unit)
values ('a0000000-0000-0000-0000-000000000068', 'WhatsApp Test Tenant', 'whatsapp-test-tenant', 'UTC', 'USD', 'active', 'liters');

insert into capabilities (key, name, description)
values ('whatsapp.channel.access', 'WhatsApp Channel Access', 'Existing test capability')
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description;

insert into roles (id, tenant_id, name, is_system, is_web_access)
values
  ('e0000000-0000-0000-0000-000000000681', 'a0000000-0000-0000-0000-000000000068', 'operador', true, false),
  ('e0000000-0000-0000-0000-000000000682', 'a0000000-0000-0000-0000-000000000068', 'mantenimiento', true, false),
  ('e0000000-0000-0000-0000-000000000683', 'a0000000-0000-0000-0000-000000000068', 'repartidor_de_combustible', true, false),
  ('e0000000-0000-0000-0000-000000000684', 'a0000000-0000-0000-0000-000000000068', 'supervisor', true, true),
  ('e0000000-0000-0000-0000-000000000685', 'a0000000-0000-0000-0000-000000000068', 'custom_whatsapp_admin', false, true);

insert into role_capabilities (role_id, capability_id)
select role_id, capability_id
from (
  values
    ('e0000000-0000-0000-0000-000000000684'::uuid),
    ('e0000000-0000-0000-0000-000000000685'::uuid)
) seeded(role_id)
cross join (
  select id as capability_id
  from capabilities
  where key = 'whatsapp.channel.access'
) capability;

\i supabase/migrations/20260622183000_seed_whatsapp_channel_access.sql

do $$
declare
  operative_grants int;
  supervisor_grants int;
  custom_grants int;
begin
  select count(*) into operative_grants
  from roles r
  join role_capabilities rc on rc.role_id = r.id
  join capabilities c on c.id = rc.capability_id
  where r.tenant_id = 'a0000000-0000-0000-0000-000000000068'
    and r.is_system = true
    and r.name in ('operador', 'mantenimiento', 'repartidor_de_combustible')
    and c.key = 'whatsapp.channel.access';

  select count(*) into supervisor_grants
  from roles r
  join role_capabilities rc on rc.role_id = r.id
  join capabilities c on c.id = rc.capability_id
  where r.tenant_id = 'a0000000-0000-0000-0000-000000000068'
    and r.is_system = true
    and r.name = 'supervisor'
    and c.key = 'whatsapp.channel.access';

  select count(*) into custom_grants
  from roles r
  join role_capabilities rc on rc.role_id = r.id
  join capabilities c on c.id = rc.capability_id
  where r.tenant_id = 'a0000000-0000-0000-0000-000000000068'
    and r.is_system = false
    and r.name = 'custom_whatsapp_admin'
    and c.key = 'whatsapp.channel.access';

  if operative_grants != 3 then
    raise exception 'FAIL: expected 3 operative system grants, got %', operative_grants;
  end if;

  if supervisor_grants != 0 then
    raise exception 'FAIL: expected supervisor system grant removed, got %', supervisor_grants;
  end if;

  if custom_grants != 1 then
    raise exception 'FAIL: expected custom role grant retained, got %', custom_grants;
  end if;

  raise notice 'PASS: WhatsApp channel access backfill grants operative system roles, removes non-operative system grants, and keeps custom grants';
end $$;

rollback;
