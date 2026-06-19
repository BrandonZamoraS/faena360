-- Issue #25: add identifier existence check with self-exclusion
-- Enables phone uniqueness validation during user updates by excluding
-- the target user from the duplicate lookup.
-- Uses a DISTINCT function name to avoid PostgREST overload ambiguity.

create or replace function public.user_profile_identifier_exists_excluding(
  lookup_email text,
  lookup_phone text,
  exclude_user_id uuid
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
    where up.id != exclude_user_id
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

-- Prevent enumeration attacks: restrict both functions to service_role only.
revoke execute on function public.user_profile_identifier_exists(text, text) from public;
revoke execute on function public.user_profile_identifier_exists(text, text) from anon;
revoke execute on function public.user_profile_identifier_exists(text, text) from authenticated;
grant execute on function public.user_profile_identifier_exists(text, text) to service_role;

revoke execute on function public.user_profile_identifier_exists_excluding(text, text, uuid) from public;
revoke execute on function public.user_profile_identifier_exists_excluding(text, text, uuid) from anon;
revoke execute on function public.user_profile_identifier_exists_excluding(text, text, uuid) from authenticated;
grant execute on function public.user_profile_identifier_exists_excluding(text, text, uuid) to service_role;
