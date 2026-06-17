# Tasks: Edit Roles and Deactivate Users (Issue #25)

> **ARCHIVED**: 2026-06-16 — All tasks complete. Change merged to main specs and moved to archive.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-180 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All three gap-fixes (domain + app + infra + UI + tests) | PR 1 | Single PR; well under 400-line budget |

## Phase 1: Domain Contracts

- [x] 1.1 Add `"duplicate_identifier"` to `MutateTenantUserErrorCode` union type in `packages/domain/src/auth/user-management.ts`
- [x] 1.2 Add `identifierExistsExcluding(input: { userId, email, phone? })` method to `UserManagementRepository` interface in `packages/domain/src/auth/user-management.ts`

## Phase 2: Infrastructure Implementation

- [x] 2.1 Implement `identifierExistsExcluding` in `SupabaseUserManagementRepository` — call RPC `user_profile_identifier_exists` with `exclude_user_id` param, normalize email/phone, return boolean
- [x] 2.2 Create Supabase migration `supabase/migrations/20260616000000_issue_25_identifier_exists_exclude.sql` — alter `user_profile_identifier_exists` RPC to accept optional `exclude_user_id uuid default null` and add `AND (exclude_user_id IS NULL OR up.id != exclude_user_id)` filter

## Phase 3: Application Use Case

- [x] 3.1 Add optional `capabilityInvalidator?: { invalidate(scope: CapabilityScope): Promise<void> }` to `UserManagementServiceDependencies` in `packages/application/src/auth/user-management.ts`
- [x] 3.2 In `updateUser`, add phone uniqueness check: call `repository.identifierExistsExcluding({ userId, email, phone })` before `updateProfile` (only when `phone` is present); return `{ ok: false, code: "duplicate_identifier" }` if true
- [x] 3.3 In `updateUser`, after successful `replaceRoles`, call `dependencies.capabilityInvalidator?.invalidate({ tenantId, userId: normalizedInput.userId })` if `capabilityInvalidator` is provided

## Phase 4: UI Wiring

- [x] 4.1 Add `<RoleCheckboxes roles={input.roles} />` inside the update form in `renderUserAdminShell`, gated by `canManageRoles`, after the phone input and before the submit button
- [x] 4.2 In `updateUserAction`, read `roleIds` from FormData: `formData.getAll("roleIds").filter(...)` and pass as `roleIds` field to `service.updateUser()` input
- [x] 4.3 In `buildUserManagementService`, wire `capabilityInvalidator` dependency: create `{ invalidate(scope) { /* call effective capabilities cache invalidate */ } }` and pass to `createUserManagementService`

## Phase 5: Testing

- [x] 5.1 Add application unit test: `updateUser` rejects duplicate phone via `identifierExistsExcluding` — mock repository to return `true`, assert `{ ok: false, code: "duplicate_identifier" }` in `packages/application/src/auth/user-management.test.ts`
- [x] 5.2 Add application unit test: self-exclusion allows same phone — mock `identifierExistsExcluding` to return `false` when called with own userId, assert update succeeds
- [x] 5.3 Add application unit test: `updateUser` calls `capabilityInvalidator.invalidate` after `replaceRoles` when `roleIds` provided — mock invalidator, verify `invalidate` called with correct scope
- [x] 5.4 Add application unit test: `updateUser` skips invalidation when `capabilityInvalidator` is undefined — assert no error thrown
- [x] 5.5 Add infrastructure test: `identifierExistsExcluding` passes `exclude_user_id` to RPC — mock Supabase client, verify RPC call includes `exclude_user_id` param
- [x] 5.6 Add presentation runtime test: update form renders role checkboxes when `canManageRoles` is true in `apps/web/app/dashboard/admin_usuarios/page.runtime.test.tsx`

## Phase 6: Verification

- [x] 6.1 Run `pnpm -r typecheck` — no type errors
- [x] 6.2 Run `pnpm test` — all existing + new tests pass
- [x] 6.3 Run `pnpm lint` — no lint errors
- [x] 6.4 Run `pnpm format:check` — formatting correct
