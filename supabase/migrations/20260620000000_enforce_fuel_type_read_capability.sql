drop policy if exists "tipos_combustible tenant isolation - SELECT"
  on public.tipos_combustible;

create policy "tipos_combustible tenant isolation - SELECT"
  on public.tipos_combustible
  for select
  to authenticated
  using (
    tenant_id = public.current_app_tenant_id()
    and public.current_app_user_has_capability('fuel_types:read')
  );
