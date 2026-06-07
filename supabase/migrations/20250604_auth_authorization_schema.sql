-- Authorization schema base - issue #17
-- Phase: 1.1 Authorization (MVP)
-- Completes the authorization schema after onboarding tables.

-- --------------------------------------------------------
-- 1. Extend tenants with fuel_unit
-- --------------------------------------------------------
alter table tenants
  add column if not exists fuel_unit text not null default 'liters'
    check (fuel_unit in ('liters', 'gallons_us', 'gallons_imperial'));

-- --------------------------------------------------------
-- 2. Complete existing onboarding authorization tables
-- --------------------------------------------------------
create or replace function normalize_user_profiles_contact_values()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email = trim(new.email);
  end if;

  if new.phone is not null then
    new.phone = trim(new.phone);
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'user_profiles_normalize_contact_values'
      and tgrelid = 'public.user_profiles'::regclass
  ) then
    create trigger user_profiles_normalize_contact_values
      before insert or update on user_profiles
      for each row
      execute function normalize_user_profiles_contact_values();
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_id_tenant_id_key'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table user_profiles
      add constraint user_profiles_id_tenant_id_key unique (id, tenant_id);
  end if;
end $$;

create or replace function normalize_roles_name()
returns trigger
language plpgsql
as $$
begin
  new.name = trim(new.name);
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'roles_normalize_name'
      and tgrelid = 'public.roles'::regclass
  ) then
    create trigger roles_normalize_name
      before insert or update on roles
      for each row
      execute function normalize_roles_name();
  end if;
end $$;

-- --------------------------------------------------------
-- 3. user_capability_overrides
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
-- 4. audit_log (minimal)
-- --------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references user_profiles(id) on delete set null,
  target_user_id uuid references user_profiles(id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  occurred_at timestamptz not null default now()
);

-- --------------------------------------------------------
-- 5. Indexes
-- --------------------------------------------------------
-- Tenant lookup indexes
create index if not exists idx_user_profiles_tenant_id on user_profiles(tenant_id);
create index if not exists idx_roles_tenant_id on roles(tenant_id);

-- Join indexes on FK columns not covered by unique/primary constraints
create index if not exists idx_role_capabilities_capability_id on role_capabilities(capability_id);
create index if not exists idx_user_roles_tenant_id on user_roles(tenant_id);
create index if not exists idx_user_roles_role_id on user_roles(role_id);
create index if not exists idx_user_capability_overrides_capability_id on user_capability_overrides(capability_id);

-- Audit lookup indexes
create index if not exists idx_audit_log_actor_user_id on audit_log(actor_user_id);
create index if not exists idx_audit_log_target_user_id on audit_log(target_user_id);
