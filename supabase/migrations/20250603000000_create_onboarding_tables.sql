-- Create onboarding tables required by tenant bootstrap and authorization.
-- This migration runs after tenants/init and before capability seeding.
-- Phase: 1.1 Infrastructure (MVP)

-- --------------------------------------------------------
-- capabilities (global catalog)
-- --------------------------------------------------------
create table capabilities (
  id uuid primary key default gen_random_uuid(),
  "key" text not null unique check (length(trim("key")) > 0),
  "name" text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger capabilities_updated_at
  before update on capabilities
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- tenants: add fuel_unit used by onboarding
-- --------------------------------------------------------
alter table tenants
  add column if not exists fuel_unit text not null default 'liters'
    check (fuel_unit in ('liters', 'gallons_us', 'gallons_imperial'));

-- --------------------------------------------------------
-- user_profiles
-- --------------------------------------------------------
create table user_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  auth_user_id uuid not null,
  email text not null,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- roles (per-tenant)
-- --------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  "name" text not null,
  is_system boolean not null default false,
  is_web_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, "name")
);

create trigger roles_updated_at
  before update on roles
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- role_capabilities (many-to-many)
-- --------------------------------------------------------
create table role_capabilities (
  role_id uuid not null references roles(id) on delete cascade,
  capability_id uuid not null references capabilities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, capability_id)
);

-- --------------------------------------------------------
-- user_roles (membership)
-- --------------------------------------------------------
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_id)
);
