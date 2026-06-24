-- Fix PostgREST embed ambiguity between user_profiles and user_roles.
-- Keep the original tenant-aware profile FK and remove only the redundant inverse-order FK.

do $$
declare
  v_original_fk_exists boolean;
begin
  if to_regclass('public.user_roles') is null or to_regclass('public.user_profiles') is null then
    raise notice 'Skipping user_roles/profile FK cleanup because required tables are missing.';
    return;
  end if;

  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_roles'::regclass
      and c.confrelid = 'public.user_profiles'::regclass
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) = 'FOREIGN KEY (tenant_id, user_id) REFERENCES user_profiles(tenant_id, id) ON DELETE CASCADE'
  ) into v_original_fk_exists;

  if not v_original_fk_exists then
    alter table public.user_roles
      add constraint user_roles_tenant_id_user_id_fkey
      foreign key (tenant_id, user_id)
      references public.user_profiles(tenant_id, id)
      on delete cascade;
  end if;

  if exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_roles'::regclass
      and c.conname = 'user_roles_user_id_tenant_id_fkey'
  ) then
    alter table public.user_roles
      drop constraint user_roles_user_id_tenant_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_roles'::regclass
      and c.confrelid = 'public.user_profiles'::regclass
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) = 'FOREIGN KEY (tenant_id, user_id) REFERENCES user_profiles(tenant_id, id) ON DELETE CASCADE'
  ) then
    raise exception 'user_roles tenant-aware profile FK is missing after cleanup';
  end if;
end $$;
