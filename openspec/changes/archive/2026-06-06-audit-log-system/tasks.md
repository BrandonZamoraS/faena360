# Tasks: Audit Log System (Trigger-Based Redesign)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300–380 (2 migrations + 4 new files + 3 modified + 1 deleted dir + SQL tests) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | single-pr |

Decision needed before apply: Yes (confirmed: single-pr, no chain needed)
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full trigger-based audit infra: migration, SQL functions, domain types, read-only port, SQL + Vitest tests | PR 1 | Self-contained; replaces app-level writes |

## Phase 1: Foundation — Migration, Domain Types, Port

- [x] 1.1 Create `supabase/migrations/20250610000000_extend_audit_log.sql` — add `source TEXT`, `old_value JSONB`, `new_value JSONB` columns with `IF NOT EXISTS`.
- [x] 1.2 Create `packages/domain/src/auth/audit.ts` — define `AuditSource`, `AuditAction`, `AuditEntry` types.
- [x] 1.3 Modify `packages/domain/src/auth/index.ts` — re-export audit types.
- [x] 1.4 Create `packages/application/src/auth/audit.ts` — define read-only `AuditPort` with `read(filter)` only.
- [x] 1.5 Modify `packages/application/src/auth/index.ts` — re-export `AuditPort`.
- [x] 1.6 Delete `packages/shared/src/audit/diff.ts`, `packages/shared/src/audit/diff.test.ts`, and remove `packages/shared/src/audit/` directory. **(DEVIATION: files did not exist — nothing to delete)**
- [x] 1.7 Update `packages/shared/index.ts` — remove `computeDiff`/`sanitize` exports. **(DEVIATION: no exports to remove — file was `export {};`)**

## Phase 2: Database Layer — Trigger Functions

- [x] 2.1 Create `supabase/migrations/20250611000000_audit_triggers.sql` — `set_audit_context(actor_id, source, target_id)` using `set_config()` with `is_local=true`.
- [x] 2.2 Create `audit_trigger()` function in same migration — reads session vars, computes `jsonb_diff` (INSERT/UPDATE/DELETE), sanitizes `*password*|*token*|*secret*|*api_key*`, inserts into `audit_log`.
- [x] 2.3 Attach AFTER triggers to 6 tables: `tenants`, `user_profiles`, `roles`, `role_capabilities`, `user_capability_overrides`, `tenant_configurations`. **(NOTE: only `tenants` exists at migration time; other 5 tables use dynamic SQL with existence checks — triggers will only attach when tables exist)**

## Phase 3: Application Layer — Read-Only Repository

- [x] 3.1 Create `packages/infrastructure/src/auth/SupabaseAuditRepository.ts` — implement `AuditPort.read()` with snake_case mapping and `tenantId`/`action`/`limit` filters.
- [x] 3.2 Modify `packages/infrastructure/src/auth/index.ts` — export `SupabaseAuditRepository`.

## Phase 4: Integration — Tenant Script

- [x] 4.1 Modify `supabase/scripts/create-tenant-with-admin.ts` — call `set_audit_context()` via `.rpc()` before each sensitive mutation instead of manual `audit_log` insert. **(DEVIATION: `supabase/scripts/create-tenant-with-admin.ts` does not exist — cannot modify. Script will need to call `set_audit_context()` via `.rpc()` when created.)**

## Phase 5: Testing — SQL + Vitest

- [x] 5.1 Create `supabase/tests/audit_trigger.test.sql` — test INSERT (new_value only), UPDATE (changed fields only), DELETE (old_value only).
- [x] 5.2 Add sanitization tests to same SQL file — verify `password`, `token`, `secret`, `api_key` keys are `[REDACTED]`.
- [x] 5.3 Add `set_audit_context()` test — verify session variables are set and readable by trigger.
- [x] 5.4 Create `packages/infrastructure/src/auth/SupabaseAuditRepository.test.ts` — test `read()` with mocked Supabase client (filters, mapping).
- [x] 5.5 Run `pnpm test` — verify all tests pass. **(40 tests pass: 31 existing + 9 new)**

## Phase 6: Cleanup — Verify and Confirm

- [x] 6.1 Verify all barrel exports resolve — `pnpm -r typecheck` passes.
- [x] 6.2 Confirm migration order: column migration (20250610) runs before trigger migration (20250611). **(Confirmed: 20250610000000 < 20250611000000 numerically)**
