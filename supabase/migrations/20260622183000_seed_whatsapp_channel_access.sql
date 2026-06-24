-- Backfill the WhatsApp channel capability and grant it only to operative system roles.

insert into capabilities ("key", "name", description)
values ('whatsapp.channel.access', 'WhatsApp Channel Access', 'Allows operative access through the WhatsApp channel.')
on conflict ("key") do update
  set
    "name" = excluded."name",
    description = excluded.description,
    updated_at = now();

insert into role_capabilities (role_id, capability_id)
select r.id, c.id
from roles r
join capabilities c on c."key" = 'whatsapp.channel.access'
where r.is_system = true
  and r."name" in ('operador', 'mantenimiento', 'repartidor_de_combustible')
on conflict (role_id, capability_id) do nothing;

delete from role_capabilities rc
using roles r, capabilities c
where rc.role_id = r.id
  and rc.capability_id = c.id
  and r.is_system = true
  and r."name" not in ('operador', 'mantenimiento', 'repartidor_de_combustible')
  and c."key" = 'whatsapp.channel.access';
