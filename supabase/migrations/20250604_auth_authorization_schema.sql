-- Authorization schema base — issue #17
-- Phase: 1.1 Authorization (MVP)
-- Adds fuel_unit to tenants, then creates authorization tables in FK order.

-- --------------------------------------------------------
-- 1. Extend tenants with fuel_unit
-- --------------------------------------------------------
alter table tenants
  add column fuel_unit text not null default 'liters'
    check (fuel_unit in ('liters', 'gallons_us', 'gallons_imperial'));

-- --------------------------------------------------------
-- 2. user_profiles
-- --------------------------------------------------------
create table user_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text unique check (length(trim(email)) > 0),
  phone text unique check (length(trim(phone)) > 0),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- 3. capabilities (global catalog)
-- --------------------------------------------------------
create table capabilities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(trim(key)) > 0),
  name text not null unique check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger capabilities_updated_at
  before update on capabilities
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- 4. roles (tenant-scoped)
-- --------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_system boolean not null default false,
  is_web_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create trigger roles_updated_at
  before update on roles
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- 5. role_capabilities (join: role ↔ capability)
-- --------------------------------------------------------
create table role_capabilities (
  role_id uuid not null references roles(id) on delete cascade,
  capability_id uuid not null references capabilities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, capability_id)
);

-- --------------------------------------------------------
-- 6. user_roles (join: user ↔ role)
-- --------------------------------------------------------
create table user_roles (
  user_id uuid not null references user_profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- --------------------------------------------------------
-- 7. user_capability_overrides
-- --------------------------------------------------------
create table user_capability_overrides (
  user_id uuid not null references user_profiles(id) on delete cascade,
  capability_id uuid not null references capabilities(id) on delete cascade,
  grant_type text not null check (grant_type in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, capability_id)
);

create trigger user_capability_overrides_updated_at
  before update on user_capability_overrides
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- 8. audit_log (minimal)
-- --------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references user_profiles(id) on delete set null,
  target_user_id uuid references user_profiles(id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  occurred_at timestamptz not null default now()
);

-- --------------------------------------------------------
-- 9. Indexes
-- --------------------------------------------------------
-- Tenant lookup indexes
create index idx_user_profiles_tenant_id on user_profiles(tenant_id);
create index idx_roles_tenant_id on roles(tenant_id);

-- Join indexes on FK columns not covered by unique/primary constraints
create index idx_role_capabilities_capability_id on role_capabilities(capability_id);
create index idx_user_roles_role_id on user_roles(role_id);
create index idx_user_capability_overrides_capability_id on user_capability_overrides(capability_id);

-- Audit lookup indexes
create index idx_audit_log_actor_user_id on audit_log(actor_user_id);
create index idx_audit_log_target_user_id on audit_log(target_user_id);
