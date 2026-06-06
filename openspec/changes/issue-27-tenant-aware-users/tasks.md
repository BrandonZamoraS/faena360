# Tasks: Tenant-Aware Users

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~560-820 (additions + deletions, includes restoration seams + migration/security checks + tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1: Foundations + seam recovery; PR2: user-management orchestration + repository contracts; PR3: SQL constraints + adapter tests + end-to-end verification |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Restore/align auth seams and add domain/application contracts | PR 1 | Includes compatibility with issue #20/#23 seams |
| 2 | Implement tenant-aware orchestration + capability checks | PR 2 | PR2 base = PR1 branch |
| 3 | Implement Supabase adapters, SQL constraints, and verification tests | PR 3 | PR3 base = PR2 branch |

## Phase 1: Foundation + seam recovery

- [x] 1.1 Create `packages/domain/src/auth/` and `packages/application/src/auth/` folder structure and add `src/index.ts` export points where absent.
- [x] 1.2 Create/restore `packages/application/src/auth/effective-capabilities.ts` so `createEffectiveCapabilitiesResolver` and related repository contract remain compatible with issue #20/#23 consumers.
- [x] 1.3 Create `packages/domain/src/auth/user-management.ts` with `CreateTenantUserInput`, `TenantUserSummary`, `CreateTenantUserErrorCode`, and `UserManagementRepository`/`AuthAdminPort` contracts.
- [x] 1.4 Export user-management domain contracts from `packages/domain/src/auth/index.ts` and `packages/domain/index.ts`.
- [x] 1.5 Export session-aware user-management service and ports from `packages/application/src/auth/index.ts` and `packages/application/index.ts`.

## Phase 2: Core orchestration

- [x] 2.1 Implement `packages/application/src/auth/user-management.ts` `createUser(session, input)` with tenant binding from `AppSession.tenant_id` and hard rejection of tenant parameters in input.
- [x] 2.2 Add explicit capability checks in `createUser()` and `listUsers()` for canonical keys `users:create` and `users:read`, failing authorization before any writes.
- [x] 2.3 Normalize email and phone in `createUser()` preflight, and call `UserManagementRepository.identifierExists(...)` to enforce global duplicate checks before Auth creation.
- [x] 2.4 Implement Auth-first flow in `createUser()`: `AuthAdminPort.createUser({ app_metadata: { tenant_id }})` then local profile + roles + minimal audit; persist in tenant scope only.
- [x] 2.5 Add compensation path in `createUser()`: if local profile/roles/audit step fails after Auth success, call `AuthAdminPort.deleteUser(authUserId)` and map rollback failures to a deterministic domain error.
- [x] 2.6 Implement `listUsers(session)` to return only active users by `session.tenant_id` and never read cross-tenant data.

## Phase 3: Infrastructure adapters

- [x] 3.1 Create `packages/infrastructure/src/auth/SupabaseAuthAdminAdapter.ts` with create/delete methods that set/read `app_metadata.tenant_id`.
- [x] 3.2 Create `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` implementing all `UserManagementRepository` methods, including tenant-scoped active filtering and minimal audit insert.
- [x] 3.3 Ensure repository and capability-loading methods stay compatible with `packages/application/src/auth/effective-capabilities.ts` and existing session resolution contracts.
- [x] 3.4 Export new adapters from `packages/infrastructure/src/auth/index.ts` and top-level `packages/infrastructure/index.ts`.
- [x] 3.5 Add `packages/infrastructure/src/auth/SupabaseAuthAdminAdapter.test.ts` and `packages/infrastructure/src/auth/SupabaseUserManagementRepository.test.ts` for metadata propagation, delete path, and tenant-filter mapping.

## Phase 4: SQL + constraints

- [x] 4.1 Create/update migration scripts under `supabase/migrations/` to guarantee global uniqueness checks for normalized email/phone, tenant-scoped role constraints, and any missing audit columns required by issue #27.
- [x] 4.2 Update `supabase/tests/authorization_constraints.sql` to assert duplicate email/phone rejection, tenant isolation of listing data, and expected minimal `audit_log` contract behavior.

## Phase 5: Verification

- [x] 5.1 Add/execute unit tests in `packages/application/src/auth/user-management.test.ts` for capability rejection, duplicate preflight, compensation, and tenant-only listing defaults.
- [x] 5.2 Add adapter-level assertion for SQL-style failures and fallback behavior in `packages/infrastructure/src/auth/*.test.ts` where available.
- [x] 5.3 Run `npx tsc --noEmit` and `pnpm --dir faena_frontend lint` (or workspace equivalents) and capture any environment-gated blockers for Supabase SQL validation.
