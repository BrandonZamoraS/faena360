# Verification Report

**Change**: Edit Roles and Deactivate Users (Issue #25)
**Version**: N/A
**Mode**: Standard

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 20 |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Build**: Passed
```text
$ pnpm -r typecheck
Scope: 5 of 6 workspace projects
packages/domain typecheck$ tsc --noEmit
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
packages/domain typecheck: Done
packages/application typecheck$ tsc --noEmit
packages/application typecheck: Done
packages/infrastructure typecheck$ tsc --noEmit
packages/infrastructure typecheck: Done
apps/web typecheck$ tsc --noEmit
apps/web typecheck: Done
```

**Tests**: 173 passed / 0 failed / 0 skipped
```text
$ vitest run
Test Files  21 passed (21)
Tests       173 passed (173)
```

**Lint**: Passed
```text
$ pnpm -r lint
Scope: 5 of 6 workspace projects
apps/web lint$ eslint
apps/web lint: Done
```

**Format (changed files)**: Passed
```text
$ npx prettier --check <changed-files>
All matched files use Prettier code style!
```

**Coverage**: Not available (no coverage threshold configured).

## Spec Compliance Matrix

### Authorization Base Spec

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Local user profiles | Profile is stored for a tenant user | Existing coverage | COMPLIANT |
| Local user profiles | Duplicate contact data on create is rejected | Existing coverage | COMPLIANT |
| Local user profiles | Duplicate phone on update is rejected | `packages/application/src/auth/user-management.test.ts > rejects update with duplicate phone via identifierExistsExcluding` | COMPLIANT |
| Local user profiles | Same-phone update is allowed (self-exclusion) | `packages/application/src/auth/user-management.test.ts > allows update with same phone via self-exclusion` | COMPLIANT |

### Effective Capabilities Spec

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Cache and Guard | Cached result is reused until invalidated | `packages/application/src/auth/effective-capabilities.test.ts > reuses cached capabilities until invalidated` | COMPLIANT |
| Cache and Guard | Expired cached result is refreshed | `packages/application/src/auth/effective-capabilities.test.ts > refreshes cached capabilities after the TTL expires` | COMPLIANT |
| Cache and Guard | Cache invalidated after role change in updateUser | `packages/application/src/auth/user-management.test.ts > invalidates capabilities cache after successful replaceRoles` | COMPLIANT |
| Cache and Guard | Missing capability fails authorization | `packages/application/src/auth/effective-capabilities.test.ts > throws capability_denied when a required capability is missing` | COMPLIANT |
| Cache and Guard | Present capability passes authorization | `packages/application/src/auth/effective-capabilities.test.ts > returns capabilities when a required capability is present` | COMPLIANT |

**Compliance summary**: 9/9 scenarios compliant

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Phone uniqueness on update | Implemented | `identifierExistsExcluding` called before `updateProfile` when `phone` is present; returns `duplicate_identifier` on conflict. |
| Self-exclusion on update | Implemented | `identifierExistsExcluding` receives `userId` to exclude the target user from the duplicate lookup. |
| Capabilities cache invalidation on role change | Implemented | `capabilityInvalidator.invalidate` called after successful `replaceRoles` in `updateUser`. |
| Role editing in update form | Implemented | `<RoleCheckboxes>` rendered in update form gated by `canManageRoles`; `roleIds` read from FormData in `updateUserAction`. |
| Audit on update | Implemented | `recordUserUpdatedAudit` called after successful profile/role mutation. |
| Capability gating | Implemented | `users:update` required for profile edits; `roles:update` required when `roleIds` present. |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Self-exclusion API (`identifierExistsExcluding`) | Partial | Domain port shape deviates: design specified `{ userId, email, phone? }`; implementation uses `{ userId, phone }`. Infrastructure resolves email internally via extra query. Behavior is correct. |
| RPC backward compatibility | Yes | Existing `user_profile_identifier_exists` altered with optional `exclude_user_id uuid default null`. |
| Cache invalidation port | Yes | Application `UserManagementServiceDependencies` includes optional `capabilityInvalidator`. |
| Invalidation timing | Yes | Invalidation occurs after successful `replaceRoles`, not before. |
| UI role checkboxes placement | Yes | `<RoleCheckboxes>` reused in both create and update forms. |

## Issues Found

**CRITICAL**: None

**WARNING**:
1. **Domain contract deviation**: `UserManagementRepository.identifierExistsExcluding` domain port signature is `{ userId, phone }` rather than the designed `{ userId, email, phone? }`. The infrastructure layer compensates by querying the user's email before calling the RPC, which adds an extra round-trip and narrows the port contract. This does not break any spec scenario but diverges from the documented design decision.

**SUGGESTION**:
1. **UI cannot clear all roles on update**: `updateUserAction` only passes `roleIds` to the service when `formData.getAll("roleIds")` yields a non-empty array. If an administrator unchecks every role in the update form, the payload omits `roleIds` entirely and `replaceRoles` is skipped, leaving existing roles intact. If clearing all roles is a desired business operation, the action should pass an empty array explicitly.
2. **Ephemeral cache invalidation**: In `buildUserManagementService`, a new `InMemoryEffectiveCapabilitiesCache` instance is created per server-action invocation. The `capabilityInvalidator` invalidates this ephemeral cache, but the capability checker reads from `session.effective_capabilities` (resolved fresh from the database by the session refresher on every request). The invalidation is therefore a no-op in the current web architecture. Consider wiring a shared cache or documenting this as forward-compatibility wiring.

## Verdict

**PASS WITH WARNINGS**

All spec scenarios are covered by passing tests, all acceptance criteria are met, and the implementation is behaviorally correct. Two non-blocking items are noted: a domain port signature deviation from the design (behavior preserved) and a UI limitation around clearing all roles. Format, typecheck, lint, and tests are clean for the changed files.
