# Tasks: RLS Multitenant Isolation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (migration + helper) → PR 2 (RLS policies + tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema changes: helper function + ALTER TABLE + backfill + indexes | PR 1 | Base: main; standalone deployable migration |
| 2 | RLS enablement + policies + delete-deny + tests + docs | PR 2 | Base: main (or PR 1 branch if stacked); depends on Unit 1 migration |

## Phase 1: Infrastructure (Schema & Helper)

- [x] 1.1 Create `supabase/migrations/20250606000000_rls_multitenant_isolation.sql` — add `current_app_tenant_id()` helper returning `uuid`, null on missing/malformed JWT claim
- [x] 1.2 In same migration: `ALTER TABLE audit_log ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE`
- [x] 1.3 In same migration: `ALTER TABLE user_capability_overrides ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE`
- [x] 1.4 In same migration: backfill `audit_log.tenant_id` from `actor_user_id → user_profiles.tenant_id`, fallback `target_user_id → user_profiles.tenant_id`; raise exception if any row remains null
- [x] 1.5 In same migration: backfill `user_capability_overrides.tenant_id` from `user_id → user_profiles.tenant_id`; raise exception if any row remains null
- [x] 1.6 In same migration: `ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL` and `ALTER TABLE user_capability_overrides ALTER COLUMN tenant_id SET NOT NULL`
- [x] 1.7 In same migration: add indexes `idx_audit_log_tenant_id` and `idx_user_capability_overrides_tenant_id`

## Phase 2: Core Implementation (RLS Policies)

- [x] 2.1 Enable RLS on `user_profiles`, `roles`, `user_roles`, `role_capabilities`, `user_capability_overrides`, `audit_log`
- [x] 2.2 Create `SELECT` policy on `user_profiles` with `USING (tenant_id = current_app_tenant_id())`
- [x] 2.3 Create `INSERT`/`UPDATE` policies on `user_profiles` with `WITH CHECK (tenant_id = current_app_tenant_id())`
- [x] 2.4 Create `FOR DELETE USING (false)` policy on `user_profiles`
- [x] 2.5 Create `SELECT`/`INSERT`/`UPDATE` policies on `roles` with `tenant_id = current_app_tenant_id()`
- [x] 2.6 Create `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies on `user_roles` via join: `USING (role_id IN (SELECT id FROM roles WHERE tenant_id = current_app_tenant_id()))` and `WITH CHECK` variant
- [x] 2.7 Create `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies on `role_capabilities` via join: `USING (role_id IN (SELECT id FROM roles WHERE tenant_id = current_app_tenant_id()))` and `WITH CHECK` variant
- [x] 2.8 Create `SELECT`/`INSERT`/`UPDATE` policies on `user_capability_overrides` with `tenant_id = current_app_tenant_id()`
- [x] 2.9 Create `SELECT`/`INSERT`/`UPDATE` policies on `audit_log` with `tenant_id = current_app_tenant_id()` (null-safe: null tenant denies access)
- [x] 2.10 Verify `capabilities` table has NO tenant-scoped RLS (global catalog, per design decision)

## Phase 3: Testing (SQL Validation)

- [x] 3.1 Create `supabase/tests/rls_multitenant_isolation.sql` — setup: two tenants, two users per tenant, simulated JWT claims via `set local request.jwt.claims`
- [x] 3.2 Test: tenant A user CAN SELECT/INSERT/UPDATE own-tenant `user_profiles` rows (scenario: "Cross-tenant profile access is denied")
- [x] 3.3 Test: tenant A user CANNOT SELECT/UPDATE/DELETE tenant B `user_profiles`, `roles`, `user_capability_overrides`, `audit_log` rows (scenario: "Cross-tenant role/grant/override access is denied")
- [x] 3.4 Test: tenant A user CANNOT INSERT `user_profiles` or `roles` with a different `tenant_id` (WITH CHECK enforcement)
- [x] 3.5 Test: `FOR DELETE USING (false)` on `user_profiles` denies deletion to authenticated role
- [x] 3.6 Test: `audit_log` RLS denies access even when `actor_user_id` or `target_user_id` is NULL (scenario: "Null actor or target does not break tenant isolation")
- [x] 3.7 Test: join-based RLS on `user_roles` and `role_capabilities` isolates by tenant through role join
- [x] 3.8 Test: `capabilities` table remains readable by all authenticated users (global catalog, no tenant filter)

## Phase 4: Documentation

- [x] 4.1 Update `supabase/docs/tenant-isolation-strategy.md` — add section on `current_app_tenant_id()` contract, auth-table RLS policies, service-role bypass warning, and Issue 3 JWT dependency
- [x] 4.2 Update `supabase/tests/authorization_constraints.sql` — add `tenant_id` to `audit_log` and `user_capability_overrides` INSERT statements where required by schema changes

## Phase 5: Review Feedback Fixes

- [x] 5.1 Add composite FK `(user_id, tenant_id) REFERENCES user_profiles(id, tenant_id)` on `user_capability_overrides` — ties override tenant to user's actual tenant
- [x] 5.2 Add `validate_audit_log_tenant()` trigger — ensures non-null actor/target belong to same tenant as audit row (composite FK not viable due to SET NULL conflict with NOT NULL tenant_id)
- [x] 5.3 Replace `audit_log` UPDATE policy with explicit deny (`using (false)`) — append-only for authenticated clients
- [x] 5.4 Correct docs: `audit_log.tenant_id` uses `ON DELETE RESTRICT` (not CASCADE); document tenant coupling constraints and append-only audit design
- [x] 5.5 Add SQL test cases: audit UPDATE deny (test 19), composite FK cross-tenant rejection (test 20), trigger cross-tenant actor/target rejection (tests 21-22) in `rls_multitenant_isolation.sql`
- [x] 5.6 Add SQL test cases: composite FK mismatch rejection (test 25), trigger cross-tenant actor/target rejection (tests 26-27) in `authorization_constraints.sql`
- [x] 5.7 Verify existing test fixtures are compatible with new composite FK and trigger constraints — all existing inserts use matching tenant/user combinations