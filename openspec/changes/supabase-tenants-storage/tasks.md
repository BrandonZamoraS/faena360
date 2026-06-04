# Tasks: Supabase Tenants and Tenant-Aware Storage

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 306 (5 files, all new) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Tenant table, RLS, storage bucket, policies, docs, config | PR 1 | Single PR; 306 lines under budget; base: origin/production |

## Phase 1: Infrastructure

- [x] 1.1 Create `supabase/config.toml` with project ID, API, DB, auth, and storage settings
- [x] 1.2 Create `supabase/migrations/20250602000000_init_tenants_and_storage.sql` with `tenants` table (id, name, slug, timezone, currency, status, timestamps)
- [x] 1.3 Add `set_updated_at()` trigger function and wire it to `tenants.updated_at`
- [x] 1.4 Enable RLS on `tenants` and create SELECT/UPDATE policies scoped to `auth.jwt()->'app_metadata'->>'tenant_id'`
- [x] 1.5 Create `tenant-files` storage bucket with `public = false`
- [x] 1.6 Create four storage RLS policies on `storage.objects` for bucket `tenant-files` (select, insert, update, delete) enforcing `storage.foldername(name)[1] = auth.jwt()->'app_metadata'->>'tenant_id'`

## Phase 2: Documentation and Seed

- [x] 2.1 Create `supabase/docs/tenant-isolation-strategy.md` documenting JWT claim approach, path convention, MVP constraints, and phase 1.1 dependency
- [x] 2.2 Create `supabase/seed.sql` as empty placeholder with comment explaining manual tenant creation in MVP

## Phase 3: Verification

- [x] 3.1 Verify `tenants` table schema matches design (8 columns including `updated_at`, constraints, defaults)
- [x] 3.2 Verify RLS policies: authenticated user with tenant_id can SELECT/UPDATE own tenant row; cannot INSERT; cross-tenant UPDATE returns no rows
- [x] 3.3 Verify storage policies: user can insert/select in their `tenant_id/` path prefix; cross-tenant insert is denied by RLS
- [x] 3.4 Verify `tenant-files` bucket has `public = false`
- [x] 3.5 Verify `set_updated_at` trigger advances `updated_at` on row update
- [x] 3.6 Verify no anonymous/public read access on tenant data or storage

**Note**: Implementation already exists on branch `feat/supabase-tenants-storage`. Phase 1 and 2 tasks are marked complete. Phase 3 verification should confirm the remaining behavior scenarios before merge.
