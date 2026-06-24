-- Issue #27: strengthen tenant-aware user constraints

-- Normalization helpers used consistently by uniqueness checks.
create or replace function public.normalize_identifier_email(value text)
returns text
language sql
immutable
as $$
  select lower(trim(value));
$$;

create or replace function public.normalize_identifier_phone(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(value), '[^0-9]+', '', 'g'), '');
$$;

-- Global uniqueness should be enforced on normalized email and phone values.
create unique index if not exists idx_user_profiles_email_normalized_unique
  on public.user_profiles ((public.normalize_identifier_email(email)))
  where email is not null;

create unique index if not exists idx_user_profiles_phone_normalized_unique
  on public.user_profiles ((public.normalize_identifier_phone(phone)))
  where public.normalize_identifier_phone(phone) is not null;

create or replace function public.user_profile_identifier_exists(
  lookup_email text,
  lookup_phone text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where public.normalize_identifier_email(up.email) = public.normalize_identifier_email(lookup_email)
       or (
         lookup_phone is not null
         and up.phone is not null
         and public.normalize_identifier_phone(up.phone) = public.normalize_identifier_phone(lookup_phone)
       )
  );
$$;

-- Keep role ownership tenant-aware for both current and migrated schemas.
alter table public.user_roles
  add column if not exists tenant_id uuid;

do $$
begin
  -- Backfill tenant_id from assigned role whenever possible.
  if to_regclass('public.user_roles') is not null and to_regclass('public.roles') is not null then
    update public.user_roles ur
    set tenant_id = r.tenant_id
    from public.roles r
    where ur.tenant_id is null
      and ur.role_id = r.id
      and r.tenant_id is not null;
  end if;

  -- If role backfill is unavailable, fallback to profile tenant.
  if to_regclass('public.user_profiles') is not null and to_regclass('public.user_roles') is not null then
    update public.user_roles ur
    set tenant_id = up.tenant_id
    from public.user_profiles up
    where ur.tenant_id is null
      and (
        (ur.user_id = up.auth_user_id)
        or (ur.user_id = up.id)
      );
  end if;

  if to_regclass('public.user_roles') is not null and to_regclass('public.roles') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.user_roles'::regclass
        and conname = 'user_roles_tenant_id_fkey'
    ) then
      begin
        alter table public.user_roles
          add constraint user_roles_tenant_id_fkey
          foreign key (tenant_id) references public.tenants(id) on delete cascade;
      exception
        when duplicate_object then
          null;
        when foreign_key_violation then
          null;
        when others then
          raise notice 'Skipping user_roles_tenant_id_fkey: %', SQLERRM;
      end;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.user_roles'::regclass
        and conname = 'user_roles_role_id_tenant_id_fkey'
    ) then
      begin
        alter table public.user_roles
          add constraint user_roles_role_id_tenant_id_fkey
          foreign key (tenant_id, role_id)
          references public.roles(tenant_id, id) on delete cascade;
      exception
        when duplicate_object then
          null;
        when others then
          raise notice 'Skipping user_roles_role_id_tenant_id_fkey: %', SQLERRM;
      end;
    end if;
  end if;

  if to_regclass('public.user_roles') is not null and to_regclass('public.user_profiles') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.user_roles'::regclass
        and conname = 'user_roles_user_id_tenant_id_fkey'
    ) then
      begin
        alter table public.user_roles
          add constraint user_roles_user_id_tenant_id_fkey
          foreign key (user_id, tenant_id)
          references public.user_profiles(id, tenant_id) on delete cascade;
      exception
        when duplicate_object then
          null;
        when others then
          raise notice 'Skipping user_roles_user_id_tenant_id_fkey: %', SQLERRM;
      end;
    end if;
  end if;
end $$;
