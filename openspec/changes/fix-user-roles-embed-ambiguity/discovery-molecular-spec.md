# Molecular Spec: fix-user-roles-embed-ambiguity

## Intended behavior

`admin_usuarios` must list active tenant users with their assigned role IDs without PostgREST embed ambiguity. Tenant isolation must remain enforced at database level: users may have multiple roles, but a `user_roles` row must only connect a profile and role from the same tenant.

## Root cause

`SupabaseUserManagementRepository.listActiveUsers` queries `user_profiles` with `user_roles(role_id)`. PostgREST cannot infer which relationship to use because current migrations can create two foreign keys between `user_roles` and `user_profiles`:

- Original: `(tenant_id, user_id) -> user_profiles(tenant_id, id)` from `20250603000000_create_onboarding_tables.sql`.
- Later redundant FK: `(user_id, tenant_id) -> user_profiles(id, tenant_id)` named `user_roles_user_id_tenant_id_fkey` from `20250630000000_issue_27_tenant_user_constraints.sql`.

Both encode the same tenant-aware profile membership, so PostgREST reports: `Could not embed because more than one relationship was found for 'user_profiles' and 'user_roles'`.

## Acceptance scenarios

1. **Admin users page loads**
   - GIVEN an authenticated tenant admin opens `admin_usuarios`
   - WHEN `listActiveUsers` runs
   - THEN the query returns active users and role IDs without relationship ambiguity.

2. **Same-tenant assignment stays valid**
   - GIVEN a profile and role in the same tenant
   - WHEN inserting `user_roles(tenant_id, user_id, role_id)`
   - THEN the insert succeeds.

3. **Cross-tenant profile assignment stays rejected**
   - GIVEN a `tenant_id` from Tenant A and `user_id` from Tenant B
   - WHEN inserting a `user_roles` row
   - THEN the database rejects it through the remaining `(tenant_id, user_id)` profile FK.

4. **Cross-tenant role assignment stays rejected**
   - GIVEN a `tenant_id` from Tenant A and `role_id` from Tenant B
   - WHEN inserting a `user_roles` row
   - THEN the database rejects it through the `(tenant_id, role_id)` roles FK.

## Minimal affected areas

- `supabase/migrations/*.sql` — add cleanup migration.
- `supabase/tests/authorization_constraints.sql` or targeted SQL test — prove tenant-safe user-role constraints after cleanup.
- `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` — no primary code change expected; optional temporary embed disambiguation only if rollout demands an immediate hotfix.

## Risks

- Must verify the live/local database actually has the original `(tenant_id, user_id)` FK before dropping the redundant FK.
- Dropping the wrong FK would weaken tenant isolation; migration should guard on constraint existence and only remove `user_roles_user_id_tenant_id_fkey`.
- Supabase schema cache may need refresh/restart after migration before PostgREST stops seeing the duplicate relationship.

## Sources used

- `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts`
- `supabase/migrations/20250603000000_create_onboarding_tables.sql`
- `supabase/migrations/20250630000000_issue_27_tenant_user_constraints.sql`
- Prior verified Obsidian/enunciado finding: user/role/capability administration must remain tenant-isolated and DB-validated.
