# Design: RLS Multitenant Isolation

## Technical Approach

Add one Supabase migration after `20250604_auth_authorization_schema.sql` to centralize tenant lookup in `current_app_tenant_id()`, add required tenant columns, enable RLS on authorization tables, and attach tenant-aware policies. Direct `tenant_id` policies cover tenant-owned tables; join-based policies are limited to pure join tables. SQL validation remains the practical test harness because there is no DB test runner wired into the repo.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Helper vs repeated JWT casts | Helper adds one DB function but avoids duplicated unsafe casts | Use `public.current_app_tenant_id()` returning `uuid`, null on missing/malformed claim |
| Add `tenant_id` only where needed vs all auth tables | All-table duplication would require sync triggers | Add `tenant_id` to `audit_log` and `user_capability_overrides`; keep `user_roles`/`role_capabilities` join-based |
| Explicit delete deny vs implicit no policy | Explicit policy is noisier but auditable | Add `FOR DELETE USING (false)` on `user_profiles` |
| RLS on capability catalog | Capabilities are global, not tenant-owned | Do not tenant-filter `capabilities` in this change; only grants/overrides are isolated |

## Data Flow

```text
JWT app_metadata.tenant_id
        │
        ▼
current_app_tenant_id()
        │
        ├─ direct: tenants, user_profiles, roles, user_capability_overrides, audit_log
        └─ joins: user_roles ─→ roles/user_profiles; role_capabilities ─→ roles
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20250606000000_rls_multitenant_isolation.sql` | Create | Helper, `ALTER TABLE`, backfill/guards, indexes, RLS enablement, policies. |
| `supabase/tests/rls_multitenant_isolation.sql` | Create | Manual SQL checks for same-tenant access, cross-tenant denial, null-safe audit access, and hard-delete denial. |
| `supabase/docs/tenant-isolation-strategy.md` | Modify | Document helper contract, auth-table RLS, service-role bypass, and Issue 3 JWT dependency. |

## Interfaces / Contracts

```sql
create or replace function public.current_app_tenant_id()
returns uuid language plpgsql stable as $$
begin
  return nullif(auth.jwt()->'app_metadata'->>'tenant_id', '')::uuid;
exception when invalid_text_representation then
  return null;
end $$;
```

Migration sequence:
1. Add `tenant_id uuid references tenants(id)` to `audit_log` and `user_capability_overrides`.
2. Backfill `user_capability_overrides.tenant_id` from `user_profiles`; backfill `audit_log.tenant_id` from actor first, then target.
3. Fail with a clear exception if any existing row cannot be backfilled; then set both columns `NOT NULL` and add indexes.
4. Enable RLS on `user_profiles`, `roles`, `user_roles`, `role_capabilities`, `user_capability_overrides`, and `audit_log`.
5. Create `SELECT/INSERT/UPDATE` policies with `USING` and `WITH CHECK`; create explicit `user_profiles` delete-deny policy.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Migration | Clean reset and backfill guards | Run `supabase db reset`; inspect migration output. |
| SQL/RLS | Tenant A cannot read/write Tenant B rows; tenant A can manage own rows; profile hard delete is denied | `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/rls_multitenant_isolation.sql` using `set local role authenticated` and `set local request.jwt.claims = '{"app_metadata":{"tenant_id":"..."}}'`. |
| Regression | Existing uniqueness/cascade constraints still pass after new columns | Re-run `supabase/tests/authorization_constraints.sql`, updated where inserts now require `tenant_id`. |
| App quality | No frontend/API contract changed | Run `pnpm lint`, `pnpm -r typecheck`, and `cd apps/web && pnpm build` if dependencies are installed. |

## Migration / Rollout

No feature flag required. Apply the migration in dev/staging first, verify SQL scripts, then production. Rollback requires dropping policies, disabling RLS on affected auth tables if needed, dropping the helper and new indexes, and removing the two tenant columns only if audit/override data can be safely discarded.

## Open Questions

- [ ] None blocking. Issue 3 still must populate `app_metadata.tenant_id` for real application sessions.
