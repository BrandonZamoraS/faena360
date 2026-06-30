-- Fix PostgREST embed ambiguity between user_roles and roles.
-- Keep only the tenant-aware composite FK; drop any other FK from user_roles to roles.

do $$
declare
  v_constraint record;
begin
  if to_regclass('public.user_roles') is null or to_regclass('public.roles') is null then
    raise notice 'Skipping user_roles/roles FK cleanup because required tables are missing.';
    return;
  end if;

  -- Drop every FK between user_roles and roles EXCEPT the tenant-aware composite one.
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.user_roles'::regclass
      and confrelid = 'public.roles'::regclass
      and contype = 'f'
      and conname != 'user_roles_role_id_tenant_id_fkey'
  loop
    raise notice 'Dropping redundant FK % between user_roles and roles', v_constraint.conname;
    execute format('alter table public.user_roles drop constraint %I', v_constraint.conname);
  end loop;

  -- Safety check: the tenant-aware FK must remain.
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_roles'::regclass
      and confrelid = 'public.roles'::regclass
      and contype = 'f'
      and conname = 'user_roles_role_id_tenant_id_fkey'
  ) then
    raise exception 'user_roles_role_id_tenant_id_fkey is missing after cleanup; aborting to avoid weakening tenant isolation';
  end if;
end $$;
