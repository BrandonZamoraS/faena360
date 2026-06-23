-- Issue #68: normalized phone lookup for WhatsApp identity resolution

create or replace function public.find_whatsapp_identity_by_phone(lookup_phone text)
returns table (
  user_id uuid,
  user_name text,
  user_status text,
  tenant_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    up.id as user_id,
    up.full_name as user_name,
    up.status as user_status,
    up.tenant_id
  from public.user_profiles up
  where public.normalize_identifier_phone(up.phone) = public.normalize_identifier_phone(lookup_phone)
  limit 1;
$$;

revoke execute on function public.find_whatsapp_identity_by_phone(text) from public;
revoke execute on function public.find_whatsapp_identity_by_phone(text) from anon;
revoke execute on function public.find_whatsapp_identity_by_phone(text) from authenticated;
grant execute on function public.find_whatsapp_identity_by_phone(text) to service_role;
