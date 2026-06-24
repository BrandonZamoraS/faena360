# Tasks: Auth Authorization Schema Base

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Authorization schema migration + DB verification | PR 1 | Single PR; base: main |

## Phase 1: Migration Foundation

- [x] 1.1 Create `supabase/migrations/20250604_auth_authorization_schema.sql` — `ALTER TABLE tenants ADD COLUMN fuel_unit text NOT NULL DEFAULT 'liters' CHECK (fuel_unit IN ('liters','gallons_us','gallons_imperial'))`
- [x] 1.2 Add `user_profiles` table: `tenant_id → tenants(id)`, `auth_user_id → auth.users(id)`, unique `email`, `phone`, `auth_user_id`, timestamps, `updated_at` trigger
- [x] 1.3 Add `capabilities` table: global catalog with unique stable key/name, timestamps, `updated_at` trigger
- [x] 1.4 Add `roles` table: `tenant_id → tenants(id)`, `name`, `is_system`, `is_web_access`, unique `(tenant_id, name)`, timestamps, `updated_at` trigger
- [x] 1.5 Add `role_capabilities` table: unique `(role_id, capability_id)`, `ON DELETE CASCADE`, timestamps
- [x] 1.6 Add `user_roles` table: unique `(user_id, role_id)`, `ON DELETE CASCADE`, timestamps
- [x] 1.7 Add `user_capability_overrides` table: `grant_type CHECK IN ('allow','deny')`, unique `(user_id, capability_id)`, `ON DELETE CASCADE`, timestamps
- [x] 1.8 Add `audit_log` table: `actor_user_id`, `target_user_id`, `action`, `occurred_at`; FK deletes set nullable rather than cascade to preserve history
- [x] 1.9 Add tenant-lookup indexes on `user_profiles.tenant_id`, `roles.tenant_id`; join indexes on FK columns not covered by unique constraints

## Phase 2: DB Verification

- [x] 2.1 Create `supabase/tests/authorization_constraints.sql` — test clean `supabase db reset` applies all migrations without error
- [x] 2.2 Test global uniqueness: duplicate `email`, `phone`, `auth_user_id` inserts are rejected
- [x] 2.3 Test tenant-scoped uniqueness: duplicate `(tenant_id, name)` in `roles` is rejected; different tenants CAN share role names
- [x] 2.4 Test assignment uniqueness: duplicate `(user_id, role_id)` and `(role_id, capability_id)` and `(user_id, capability_id)` are rejected
- [x] 2.5 Test FK cascades: deleting role cascades to `role_capabilities` and `user_roles`; deleting user/capability cascades to join tables; deleting actor/target user sets `audit_log` refs to null
- [x] 2.6 Add schema-scope assertions: audit_log minimal columns present and vault-only columns absent (Test 14); tenants MVP columns present and commercial/fiscal columns absent (Test 15); profile auth linkage positive assertion (Test 16); role grants reference shared capabilities (Test 17); user override distinct from role grants (Test 18); fuel_unit schema/default/NOT NULL (Test 19); minimal audit record captures who/what/when (Test 20)

## Phase 3: Verification

- [x] 3.1 Run `supabase db reset` and confirm zero errors
- [x] 3.2 Run `supabase test` (or manual psql) with `authorization_constraints.sql`; all assertions pass
- [x] 3.3 Run `pnpm build` to confirm no TS/app regressions
