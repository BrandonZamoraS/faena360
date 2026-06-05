-- RLS Multitenant Isolation — issue #16
-- Adds current_app_tenant_id() helper, tenant_id columns on audit_log and
-- user_capability_overrides, backfill guards, indexes, RLS enablement, and
-- tenant-aware policies for all authorization tables.

-- --------------------------------------------------------
-- 1. Helper: current_app_tenant_id()
-- --------------------------------------------------------
-- Returns the tenant UUID from the current JWT's app_metadata, or NULL when
-- the claim is missing, empty, or not a valid UUID.
create or replace function public.current_app_tenant_id()
returns uuid language plpgsql stable as $$
begin
  return nullif(auth.jwt()->'app_metadata'->>'tenant_id', '')::uuid;
exception when invalid_text_representation then
  return null;
end $$;

-- --------------------------------------------------------
-- 2. Add tenant_id columns
-- --------------------------------------------------------
alter table audit_log
  add column tenant_id uuid references tenants(id) on delete restrict;

alter table user_capability_overrides
  add column tenant_id uuid references tenants(id) on delete cascade;

-- --------------------------------------------------------
-- 3. Backfill tenant_id from existing relationships
-- --------------------------------------------------------

-- audit_log: prefer actor's tenant, fall back to target's tenant
update audit_log a
set tenant_id = coalesce(
  (select up.tenant_id from user_profiles up where up.id = a.actor_user_id),
  (select up.tenant_id from user_profiles up where up.id = a.target_user_id)
)
where a.tenant_id is null;

-- user_capability_overrides: always from user_profiles via user_id
update user_capability_overrides uco
set tenant_id = (
  select up.tenant_id from user_profiles up where up.id = uco.user_id
)
where uco.tenant_id is null;

-- --------------------------------------------------------
-- 4. Backfill guards — fail loudly if any row remains null
-- --------------------------------------------------------
do $$
declare
  v_audit int;
  v_overrides int;
begin
  select count(*) into v_audit from audit_log where tenant_id is null;
  if v_audit > 0 then
    raise exception 'Backfill incomplete: % audit_log rows have no resolvable tenant_id. '
      'Ensure every audit row has an actor_user_id or target_user_id linked to a user_profile.', v_audit;
  end if;

  select count(*) into v_overrides from user_capability_overrides where tenant_id is null;
  if v_overrides > 0 then
    raise exception 'Backfill incomplete: % user_capability_overrides rows have no resolvable tenant_id. '
      'Ensure every override row has a user_id linked to a user_profile.', v_overrides;
  end if;
end $$;

-- --------------------------------------------------------
-- 5. Enforce NOT NULL after successful backfill
-- --------------------------------------------------------
alter table audit_log alter column tenant_id set not null;
alter table user_capability_overrides alter column tenant_id set not null;

-- --------------------------------------------------------
-- 6. Tenant lookup indexes
-- --------------------------------------------------------
create index idx_audit_log_tenant_id on audit_log(tenant_id);
create index idx_user_capability_overrides_tenant_id on user_capability_overrides(tenant_id);

-- --------------------------------------------------------
-- 7. Enable Row Level Security
-- --------------------------------------------------------
alter table user_profiles enable row level security;
alter table roles enable row level security;
alter table user_roles enable row level security;
alter table role_capabilities enable row level security;
alter table user_capability_overrides enable row level security;
alter table audit_log enable row level security;

-- --------------------------------------------------------
-- 8. RLS Policies — user_profiles (direct tenant_id)
-- --------------------------------------------------------
create policy "user_profiles tenant isolation - SELECT"
  on user_profiles
  for select
  to authenticated
  using (tenant_id = current_app_tenant_id());

create policy "user_profiles tenant isolation - INSERT"
  on user_profiles
  for insert
  to authenticated
  with check (tenant_id = current_app_tenant_id());

create policy "user_profiles tenant isolation - UPDATE"
  on user_profiles
  for update
  to authenticated
  using (tenant_id = current_app_tenant_id())
  with check (tenant_id = current_app_tenant_id());

-- Explicit hard-delete deny: makes the prohibition visible and auditable.
create policy "user_profiles tenant isolation - DELETE deny"
  on user_profiles
  for delete
  to authenticated
  using (false);

-- --------------------------------------------------------
-- 9. RLS Policies — roles (direct tenant_id)
-- --------------------------------------------------------
create policy "roles tenant isolation - SELECT"
  on roles
  for select
  to authenticated
  using (tenant_id = current_app_tenant_id());

create policy "roles tenant isolation - INSERT"
  on roles
  for insert
  to authenticated
  with check (tenant_id = current_app_tenant_id());

create policy "roles tenant isolation - UPDATE"
  on roles
  for update
  to authenticated
  using (tenant_id = current_app_tenant_id())
  with check (tenant_id = current_app_tenant_id());

-- --------------------------------------------------------
-- 10. RLS Policies — user_roles (join through roles)
-- --------------------------------------------------------
create policy "user_roles tenant isolation - SELECT"
  on user_roles
  for select
  to authenticated
  using (
    exists (select 1 from roles r where r.id = user_roles.role_id and r.tenant_id = current_app_tenant_id())
  );

create policy "user_roles tenant isolation - INSERT"
  on user_roles
  for insert
  to authenticated
  with check (
    exists (select 1 from roles r where r.id = user_roles.role_id and r.tenant_id = current_app_tenant_id())
  );

create policy "user_roles tenant isolation - UPDATE"
  on user_roles
  for update
  to authenticated
  using (
    exists (select 1 from roles r where r.id = user_roles.role_id and r.tenant_id = current_app_tenant_id())
  )
  with check (
    exists (select 1 from roles r where r.id = user_roles.role_id and r.tenant_id = current_app_tenant_id())
  );

create policy "user_roles tenant isolation - DELETE"
  on user_roles
  for delete
  to authenticated
  using (
    exists (select 1 from roles r where r.id = user_roles.role_id and r.tenant_id = current_app_tenant_id())
  );

-- --------------------------------------------------------
-- 11. RLS Policies — role_capabilities (join through roles)
-- --------------------------------------------------------
create policy "role_capabilities tenant isolation - SELECT"
  on role_capabilities
  for select
  to authenticated
  using (
    exists (select 1 from roles r where r.id = role_capabilities.role_id and r.tenant_id = current_app_tenant_id())
  );

create policy "role_capabilities tenant isolation - INSERT"
  on role_capabilities
  for insert
  to authenticated
  with check (
    exists (select 1 from roles r where r.id = role_capabilities.role_id and r.tenant_id = current_app_tenant_id())
  );

create policy "role_capabilities tenant isolation - UPDATE"
  on role_capabilities
  for update
  to authenticated
  using (
    exists (select 1 from roles r where r.id = role_capabilities.role_id and r.tenant_id = current_app_tenant_id())
  )
  with check (
    exists (select 1 from roles r where r.id = role_capabilities.role_id and r.tenant_id = current_app_tenant_id())
  );

create policy "role_capabilities tenant isolation - DELETE"
  on role_capabilities
  for delete
  to authenticated
  using (
    exists (select 1 from roles r where r.id = role_capabilities.role_id and r.tenant_id = current_app_tenant_id())
  );

-- --------------------------------------------------------
-- 12. RLS Policies — user_capability_overrides (direct tenant_id)
-- --------------------------------------------------------
create policy "user_capability_overrides tenant isolation - SELECT"
  on user_capability_overrides
  for select
  to authenticated
  using (tenant_id = current_app_tenant_id());

create policy "user_capability_overrides tenant isolation - INSERT"
  on user_capability_overrides
  for insert
  to authenticated
  with check (tenant_id = current_app_tenant_id());

create policy "user_capability_overrides tenant isolation - UPDATE"
  on user_capability_overrides
  for update
  to authenticated
  using (tenant_id = current_app_tenant_id())
  with check (tenant_id = current_app_tenant_id());

-- --------------------------------------------------------
-- 13. RLS Policies — audit_log (direct tenant_id, null-safe)
-- --------------------------------------------------------
-- When current_app_tenant_id() returns NULL (missing/malformed JWT), the
-- equality check evaluates to NULL (falsy), denying access. This is the
-- intended behavior: no valid tenant claim = no audit access.
create policy "audit_log tenant isolation - SELECT"
  on audit_log
  for select
  to authenticated
  using (tenant_id = current_app_tenant_id());

create policy "audit_log tenant isolation - INSERT"
  on audit_log
  for insert
  to authenticated
  with check (tenant_id = current_app_tenant_id());

-- Audit rows are append-only for authenticated clients.
-- Service role / backend functions remain the trusted update path.
create policy "audit_log tenant isolation - UPDATE deny"
  on audit_log
  for update
  to authenticated
  using (false);

-- --------------------------------------------------------
-- 14. Composite FK — user_capability_overrides(user_id, tenant_id)
-- --------------------------------------------------------
-- Ensures the override's tenant_id matches the user's actual tenant in
-- user_profiles. The referenced unique (id, tenant_id) on user_profiles
-- already exists in 20250604_auth_authorization_schema.sql.
alter table user_capability_overrides
  add constraint uco_user_tenant_fk
  foreign key (user_id, tenant_id)
  references user_profiles(id, tenant_id)
  on delete cascade;

-- --------------------------------------------------------
-- 15. Trigger — audit_log actor/target tenant validation
-- --------------------------------------------------------
-- Composite FKs are not viable here because the original actor/target FKs
-- use ON DELETE SET NULL, and a composite SET NULL would also null the
-- NOT NULL tenant_id column. A BEFORE INSERT OR UPDATE trigger enforces
-- that non-null actor/target profiles belong to the same tenant as the
-- audit row.
create or replace function public.validate_audit_log_tenant()
returns trigger language plpgsql as $$
begin
  if new.actor_user_id is not null then
    if not exists (
      select 1 from user_profiles
      where id = new.actor_user_id and tenant_id = new.tenant_id
    ) then
      raise exception 'audit_log: actor_user_id % does not belong to tenant %',
        new.actor_user_id, new.tenant_id;
    end if;
  end if;

  if new.target_user_id is not null then
    if not exists (
      select 1 from user_profiles
      where id = new.target_user_id and tenant_id = new.tenant_id
    ) then
      raise exception 'audit_log: target_user_id % does not belong to tenant %',
        new.target_user_id, new.tenant_id;
    end if;
  end if;

  return new;
end $$;

create trigger audit_log_validate_tenant
  before insert or update on audit_log
  for each row
  execute function public.validate_audit_log_tenant();
