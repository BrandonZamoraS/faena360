-- Adds user profile lifecycle status used by app-session inactive-user enforcement.

do $$
declare
  v_has_user_profiles boolean;
begin
  select to_regclass('public.user_profiles') is not null into v_has_user_profiles;

  if not v_has_user_profiles then
    raise exception 'FAIL: public.user_profiles is missing. Run baseline migrations before applying this change.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'status'
  ) then
    alter table public.user_profiles
      add column status text not null default 'active'
      check (status in ('active', 'inactive'));
  else
    alter table public.user_profiles
      alter column status set default 'active';

    update public.user_profiles
    set status = 'active'
    where status is null;

    alter table public.user_profiles
      alter column status set not null;

    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = 'public.user_profiles'::regclass
        and c.contype = 'c'
        and c.conname = 'user_profiles_status_check'
    ) then
      alter table public.user_profiles
        add constraint user_profiles_status_check
        check (status in ('active', 'inactive'));
    end if;
  end if;
end $$;
