-- Backfill projects:hide for databases that already applied the original capability seed.

insert into capabilities ("key", "name", description)
values ('projects:hide', 'Projects Hide', 'Allows hiding projects.')
on conflict ("key") do update
  set
    "name" = excluded."name",
    description = excluded.description,
    updated_at = now();
