-- Seed the global capability catalog for onboarding defaults.
--
-- This migration establishes the documented capability keys consumed by
-- `supabase/scripts/default-role-bootstrap.ts` so tenant bootstrap preflight can
-- safely validate role capability contracts before persistence.

insert into capabilities ("key", "name", description)
values
  ('assignments:read', 'Assignments Read', 'Allows reading assignment records.'),
  ('assignments:create', 'Assignments Create', 'Allows creating assignment records.'),
  ('assignments:update', 'Assignments Update', 'Allows updating assignment records.'),
  ('assignments:withdraw', 'Assignments Withdraw', 'Allows withdrawing assignment records.'),
  ('capabilities:read', 'Capabilities Read', 'Allows viewing global capabilities.'),
  ('categories:create', 'Categories Create', 'Allows creating categories.'),
  ('categories:read', 'Categories Read', 'Allows reading categories.'),
  ('categories:update', 'Categories Update', 'Allows updating categories.'),
  ('change_requests:approve', 'Change Requests Approve', 'Allows approving change requests.'),
  ('change_requests:create', 'Change Requests Create', 'Allows creating change requests.'),
  ('change_requests:read', 'Change Requests Read', 'Allows reading change requests.'),
  ('change_requests:reject', 'Change Requests Reject', 'Allows rejecting change requests.'),
  ('clients:create', 'Clients Create', 'Allows creating clients.'),
  ('clients:read', 'Clients Read', 'Allows reading clients.'),
  ('clients:update', 'Clients Update', 'Allows updating clients.'),
  ('expenses:create', 'Expenses Create', 'Allows creating expenses.'),
  ('expenses:read', 'Expenses Read', 'Allows reading expenses.'),
  ('expenses:update', 'Expenses Update', 'Allows updating expenses.'),
  ('expenses:void', 'Expenses Void', 'Allows voiding expenses.'),
  ('fuel_types:create', 'Fuel Types Create', 'Allows creating fuel type records.'),
  ('fuel_types:read', 'Fuel Types Read', 'Allows reading fuel types.'),
  ('fuel_types:update', 'Fuel Types Update', 'Allows updating fuel types.'),
  ('machines:change_status', 'Machines Change Status', 'Allows changing machine status.'),
  ('machines:create', 'Machines Create', 'Allows creating machines.'),
  ('machines:read', 'Machines Read', 'Allows reading machines.'),
  ('machines:update', 'Machines Update', 'Allows updating machines.'),
  ('projects:create', 'Projects Create', 'Allows creating projects.'),
  ('projects:finish', 'Projects Finish', 'Allows finishing projects.'),
  ('projects:pause', 'Projects Pause', 'Allows pausing projects.'),
  ('projects:read', 'Projects Read', 'Allows reading projects.'),
  ('projects:reopen', 'Projects Reopen', 'Allows reopening projects.'),
  ('projects:update', 'Projects Update', 'Allows updating projects.'),
  ('reports:read', 'Reports Read', 'Allows reading reports.'),
  ('roles:create', 'Roles Create', 'Allows creating roles.'),
  ('roles:read', 'Roles Read', 'Allows reading roles.'),
  ('roles:update', 'Roles Update', 'Allows updating roles.'),
  ('shifts:close', 'Shifts Close', 'Allows closing shifts.'),
  ('shifts:read', 'Shifts Read', 'Allows reading shifts.'),
  ('shifts:start', 'Shifts Start', 'Allows starting shifts.'),
  ('shifts:void', 'Shifts Void', 'Allows voiding shifts.'),
  ('subprojects:create', 'Subprojects Create', 'Allows creating subprojects.'),
  ('subprojects:finish', 'Subprojects Finish', 'Allows finishing subprojects.'),
  ('subprojects:read', 'Subprojects Read', 'Allows reading subprojects.'),
  ('subprojects:reopen', 'Subprojects Reopen', 'Allows reopening subprojects.'),
  ('subprojects:update', 'Subprojects Update', 'Allows updating subprojects.'),
  ('tenants:read', 'Tenants Read', 'Allows reading tenant data.'),
  ('tenants:update', 'Tenants Update', 'Allows updating tenant data.'),
  ('users:create', 'Users Create', 'Allows creating users.'),
  ('users:read', 'Users Read', 'Allows reading users.'),
  ('users:update', 'Users Update', 'Allows updating users.')
on conflict ("key") do update
  set
    "name" = excluded."name",
    description = excluded.description,
    updated_at = now();
