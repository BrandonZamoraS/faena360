# Verification Report

## Change

- Change: `fix-user-roles-embed-ambiguity`
- Mode: `openspec`
- Verdict: `PASS WITH WARNINGS`

## Completed Slice Check

| Slice | Status | Evidence |
|---|---|---|
| Schema cleanup migration | PASS | `supabase/migrations/20260625000000_fix_user_roles_embed_ambiguity.sql` preserves/adds `(tenant_id, user_id) -> user_profiles(tenant_id, id)` and drops only `user_roles_user_id_tenant_id_fkey` if present. |
| Constraint verification tests | PASS | `supabase/tests/authorization_constraints.sql` Tests 28-31 assert one remaining profile FK plus same-tenant success and cross-tenant profile/role failures. |
| Apply progress artifact | WARNING | No `apply-progress.md` found under `openspec/changes/fix-user-roles-embed-ambiguity/`. |

## Verification Evidence

### Static inspection

- Migration is schema-first, not code-first.
- Repository query still uses `user_roles(role_id)` in `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts`.
- `git diff --name-only` shows only `supabase/tests/authorization_constraints.sql` as a tracked code change; no unrelated app code diff was present.

### Command evidence

1. `supabase db reset --local`
   - Result: PASS
   - Evidence: local database recreated and migration `20260625000000_fix_user_roles_embed_ambiguity.sql` applied successfully.

2. `psql ... -f supabase/tests/authorization_constraints.sql`
   - Result: WARNING / blocked full-suite confidence
   - Evidence: suite fails earlier at Test 9 with `ERROR: null value in column "tenant_id" of relation "audit_log" violates not-null constraint` during an existing audit trigger path, before reaching Tests 28-31.

3. `psql ... -c "select c.conname, pg_get_constraintdef(c.oid) ..."`
   - Result: PASS
   - Evidence: exactly one remaining FK from `user_roles` to `user_profiles`: `user_roles_tenant_id_user_id_fkey`.

4. Focused `psql` transaction for tenant-isolation inserts
   - Result: PASS
   - Evidence: notices confirmed:
     - `PASS: same-tenant assignment accepted`
     - `PASS: cross-tenant profile assignment rejected`
     - `PASS: cross-tenant role assignment rejected`

5. `curl` PostgREST smoke query against `/rest/v1/user_profiles?select=id,user_roles(role_id)&limit=1`
   - Result: PASS
   - Evidence: HTTP `200 OK`, empty JSON array, no embed ambiguity error.

## Spec Compliance Matrix

| Requirement / Scenario | Status | Evidence |
|---|---|---|
| Primary fix is schema cleanup, not code-only embed disambiguation | PASS | Migration implements FK cleanup; repository query remains unchanged. |
| Preserve/add original FK `(tenant_id,user_id) -> user_profiles(tenant_id,id)` | PASS | Migration adds it if missing and re-checks it before exit; live query shows only `user_roles_tenant_id_user_id_fkey`. |
| Drop only redundant `user_roles_user_id_tenant_id_fkey` if present | PASS | Migration conditionally drops only that named constraint. |
| Exactly one FK from `user_roles` to `user_profiles` after migration | PASS | SQL catalog query returned one row; Test 28 also encodes this assertion. |
| Same-tenant assignment still succeeds | PASS | Focused runtime `psql` transaction notice: `PASS: same-tenant assignment accepted`. |
| Cross-tenant profile assignment still fails | PASS | Focused runtime `psql` transaction notice: `PASS: cross-tenant profile assignment rejected`. |
| Cross-tenant role assignment still fails | PASS | Focused runtime `psql` transaction notice: `PASS: cross-tenant role assignment rejected`. |
| `admin_usuarios` embed path no longer ambiguous | PASS | PostgREST smoke query returned HTTP 200 with `user_roles(role_id)` embed and no ambiguity error. |
| No unrelated app code changes required | PASS | Repository query file inspected unchanged; tracked diff only touched SQL test file. |

## Issues

### CRITICAL

- None for this change.

### WARNING

- Full `supabase/tests/authorization_constraints.sql` run is currently blocked by a pre-existing failure at Test 9 (`audit_log.tenant_id` null during audit trigger cascade), so end-to-end suite confidence depends on fixing that unrelated authorization test path.
- No `apply-progress.md` artifact was present for this change.

### SUGGESTION

- Add or restore `openspec/changes/fix-user-roles-embed-ambiguity/apply-progress.md` so verification can align completed slices with an artifact, not just code/test inspection.
- Isolate the unrelated audit trigger regression in a separate fix so the authorization SQL suite can run cleanly without needing focused fallback verification.

## Final Verdict

- `PASS WITH WARNINGS`
