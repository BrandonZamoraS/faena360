-- Backfill subprojects:hide for databases that already applied the original capability seed.

insert into capabilities ("key", "name", description)
values ('subprojects:hide', 'Subprojects Hide', 'Allows hiding subprojects.')
on conflict ("key") do update
  set
    "name" = excluded."name",
    description = excluded.description,
    updated_at = now();

insert into role_capabilities (role_id, capability_id)
select r.id, c.id
from roles r
join capabilities c on c."key" = 'subprojects:hide'
where r."name" = 'administrador'
  and r.is_system = true
on conflict (role_id, capability_id) do nothing;
