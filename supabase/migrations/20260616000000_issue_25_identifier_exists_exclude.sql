-- Issue #25: add optional exclude_user_id to identifier existence check
-- Enables phone uniqueness validation during user updates by excluding
-- the target user from the duplicate lookup.

create or replace function public.user_profile_identifier_exists(
  lookup_email text,
  lookup_phone text default null,
  exclude_user_id uuid default null
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
    where (exclude_user_id is null or up.id != exclude_user_id)
      and (
        public.normalize_identifier_email(up.email) = public.normalize_identifier_email(lookup_email)
        or (
          lookup_phone is not null
          and up.phone is not null
          and public.normalize_identifier_phone(up.phone) = public.normalize_identifier_phone(lookup_phone)
        )
      )
  );
$$;
