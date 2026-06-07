## Exploration: RLS y aislamiento multitenant (issue-16)

### Current State

**Infraestructura base (phase 1.0):** `tenants` table exists with RLS enabled using `auth.jwt()->'app_metadata'->>'tenant_id'`. Storage bucket `tenant-files` has path-based RLS enforcement. This is the only RLS currently active.

**Auth schema base (phase 1.1, archived issue-17):** Six authorization tables were created in `20250604_auth_authorization_schema.sql`:
- `user_profiles` — HAS `tenant_id` column (FK → tenants.id)
- `roles` — HAS `tenant_id` column (FK → tenants.id)
- `user_roles` — NO `tenant_id` column (tenant implicit via `user_id → user_profiles.tenant_id` or `role_id → roles.tenant_id`)
- `role_capabilities` — NO `tenant_id` column (tenant implicit via `role_id → roles.tenant_id`)
- `user_capability_overrides` — NO `tenant_id` column (vault model planned one as redundant for RLS, but was excluded from MVP scope)
- `audit_log` — NO `tenant_id` column (vault model planned one as mandatory, but was excluded from MVP scope)

**None of these tables have RLS enabled.** Only `tenants` does.

**Frontend:** No Supabase client or auth infrastructure exists yet. Issue 3 (JWT/session contract) is unstarted. The `app_metadata.tenant_id` claim is expected by the existing `tenants` RLS but has no code populating it yet.

**Vault model (`modelo-datos.md`, `reglas-integridad.md`, `migraciones.md`):**
- Phase 8 of migration plan is "Políticas RLS e índices de rendimiento" — this maps exactly to issue-16.
- Vault says `audit_log` MUST have `tenant_id` (obligatorio, RLS por tenant).
- Vault says `user_capability_overrides` SHOULD have `tenant_id` (redundante para queries eficientes y RLS).
- Vault says RLS policies should use `tenant_id = current_app_tenant_id()` pattern.
- Vault says co-tenancy enforcement at DB level is "opcional en MVP" — this change does NOT implement co-tenancy triggers.

### Key Gap: Missing `tenant_id` Columns

| Table | Has `tenant_id`? | Vault says | Policy approach |
|-------|------------------|------------|-----------------|
| `tenants` | ✅ Already | N/A | Already done |
| `user_profiles` | ✅ Already | Obligatorio | Direct: `tenant_id = current_app_tenant_id()` |
| `roles` | ✅ Already | Obligatorio | Direct: `tenant_id = current_app_tenant_id()` |
| `user_roles` | ❌ Missing | Implícito por FK | Join-based: via `roles.tenant_id` or `user_profiles.tenant_id` |
| `role_capabilities` | ❌ Missing | Implícito por FK | Join-based: via `roles.tenant_id` |
| `user_capability_overrides` | ❌ Missing | Redundante para RLS | Add column ALTER or join-based via `user_profiles.tenant_id` |
| `audit_log` | ❌ Missing | Obligatorio, RLS por tenant | **MUST add column** — `actor_user_id`/`target_user_id` can be SET NULL, breaking join-based derivation |

### Affected Areas

- `supabase/migrations/20250604_auth_authorization_schema.sql` — Existing migration; must NOT modify. New migration for RLS.
- `supabase/migrations/20250606000000_rls_multitenant_isolation.sql` (new) — RLS enable + policies + helper function + optional ALTER TABLE for missing tenant_id columns
- `supabase/tests/authorization_constraints.sql` — Reference only; new test file for RLS cross-tenant scenarios
- `supabase/docs/tenant-isolation-strategy.md` — Should be updated to reflect RLS on all auth tables
- `openspec/specs/authorization-base/spec.md` — May need refinement on RLS requirements
- `supabase/seed.sql` — May need test tenant data for RLS verification

### Approaches

#### Approach 1: Add `tenant_id` to missing tables + direct policies (recommended)

Add `tenant_id` columns via ALTER TABLE to `user_capability_overrides` and `audit_log`, then use direct `tenant_id = current_app_tenant_id()` policies everywhere. Create `current_app_tenant_id()` helper wrapping `auth.jwt()->'app_metadata'->>'tenant_id'`. For `user_roles` and `role_capabilities`, use join-based policies (no ALTER needed — tenant is implicit by FK).

- **Pros**: Matches vault design intent; `audit_log` remains correct even after user deletion (SET NULL); efficient direct column checks on tables that matter most; join-based only on pure join tables
- **Cons**: Two ALTER TABLE statements needed; data backfill if rows exist (unlikely in MVP since no users have been created)
- **Effort**: Medium

#### Approach 2: Pure join-based policies (no schema changes)

Skip adding `tenant_id` columns. All policies derive tenant via FK joins: `user_roles` joins to `roles.tenant_id`, `audit_log` joins to `user_profiles.tenant_id`.

- **Pros**: Zero schema changes; works with existing migration
- **Cons**: `audit_log` RLS breaks when `actor_user_id` is null (SET NULL on delete); performance cost of joins on every row check; doesn't align with vault model
- **Effort**: Low (but with unacceptable risk on audit_log)

#### Approach 3: Add `tenant_id` to all tables including join tables

Add `tenant_id` to `user_roles`, `role_capabilities`, `user_capability_overrides`, and `audit_log`. EVERY table has direct column check.

- **Pros**: Maximum simplicity and performance; every policy is a single column comparison
- **Cons**: Redundant data in join tables; requires data consistency triggers to keep `tenant_id` in sync with FK chain; more complex migration
- **Effort**: Medium-High

### Recommendation

**Approach 1** — the pragmatic hybrid:

1. **Create helper** `current_app_tenant_id()` → `(auth.jwt()->'app_metadata'->>'tenant_id')::uuid` — single source of truth, reusable in all policies.

2. **ALTER TABLE** to add `tenant_id` to `audit_log` (MUST — no reliable join-based alternative when actor/target are null) and `user_capability_overrides` (SHOULD — vault design intent, and it's a direct-user-scoped table where tenant derivation via join adds unnecessary complexity).

3. **Direct column policies** on `tenants` (already done), `user_profiles` (new), `roles` (new), `user_capability_overrides` (new), `audit_log` (new).

4. **Join-based policies** on `user_roles` (via `roles.tenant_id`) and `role_capabilities` (via `roles.tenant_id`).

5. **Block hard DELETE on `user_profiles`**: Create a `FOR DELETE USING (false)` policy, or simply omit a DELETE policy entirely (default deny for authenticated users). Service role retains bypass capability for backend/admin operations.

6. **Document contract**: Tenant ID comes from JWT `app_metadata`, never from client input. The `current_app_tenant_id()` function IS the boundary.

### Risks

1. **`audit_log` without `tenant_id` is architecturally broken for RLS**: If user profiles are deleted, `actor_user_id` becomes null and tenant derivation via join fails. **This is a hard requirement** — must add the column or accept that audit_log RLS is unreliable. Adding the column is the safe path.

2. **No frontend auth exists yet (Issue 3 dependency)**: The `app_metadata.tenant_id` JWT claim has no code populating it. RLS policies will be untestable end-to-end until Issue 3 delivers the auth/session contract. DB-level tests can bypass this using `set local` or direct JWT injection in psql.

3. **Service role bypass**: Backend code using Supabase service role key will bypass ALL RLS. This is correct for admin operations but means the application layer must also enforce tenant separation — RLS is a safety net, not the only defense. Document this explicitly.

4. **`user_capability_overrides` tenant_id alignment with vault**: The vault model shows `tenant_id` as part of the table design. Adding it retroactively creates a discrepancy with the current migration. This is acceptable but must be documented.

5. **JWT claim format**: The existing `tenants` policy casts `app_metadata->>'tenant_id'` to UUID. If the claim is missing or malformed, the cast fails. The helper function should handle this gracefully (return null or raise an appropriate error).

6. **No existing DB test infrastructure for RLS**: `supabase test db` is not confirmed working. Existing tests are SQL scripts run manually via psql. RLS testing requires setting JWT claims in the session — the approach needs validation.

### Ready for Proposal

**Yes** — but with these clarifications for the orchestrator:

1. **Schema change needed**: `audit_log` MUST receive a `tenant_id` column. This is not optional for reliable RLS. Accept this or decide to exclude `audit_log` from RLS scope (violates the issue requirement).
2. **`user_capability_overrides.tenant_id`**: The vault model planned it as redundant for RLS. Add it now or use join-based policy.
3. **DELETE blocking mechanism**: Confirm approach — `FOR DELETE USING (false)` policy on `user_profiles`, or no DELETE policy at all (default deny), or something else.
4. **Testing approach**: Without a working `supabase test db`, RLS tests must be SQL scripts using `set local request.jwt.claims` or `set role` to simulate different tenant contexts.
5. **JWT claim not yet populated**: Issue 3 must set `app_metadata.tenant_id` before login; this RLS change assumes that contract will be delivered.
