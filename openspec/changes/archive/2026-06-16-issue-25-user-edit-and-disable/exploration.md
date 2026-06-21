## Exploration: Editar roles y desactivar usuarios (Issue #25)

### Current State

The codebase already has a robust implementation of tenant-aware user management from issue #27. The following layers are fully implemented and tested (166 tests passing):

**Domain (`packages/domain/src/auth/`)**:
- `user-management.ts`: All types and repository contracts exist — `UpdateTenantUserInput`, `DeactivateTenantUserInput`, `MutateTenantUserErrorCode`, `UserManagementRepository` with `updateProfile`, `replaceRoles`, `deactivateProfile`, `reactivateProfile`, `recordUserUpdatedAudit`, `recordUserDeactivatedAudit`
- `session.ts`: `inactive_user` error code already consumed by login flow
- `audit.ts`: `user.update` and `user.deactivate` audit actions defined
- `capabilities.ts`: `users:update`, `roles:update` capability codes used

**Application (`packages/application/src/auth/`)**:
- `user-management.ts`: `updateUser()` AND `deactivateUser()` fully orchestrated — capability checks, normalization, repository calls, audit recording, compensation on failure
- `app-session.ts`: Login blocks inactive users (`userProfile.status !== "active"` → `inactive_user`)
- `effective-capabilities.ts`: Cache with `invalidate()` method, `requireCapability()` for authorization, `InMemoryEffectiveCapabilitiesCache` with 30s TTL

**Infrastructure (`packages/infrastructure/src/auth/`)**:
- `SupabaseUserManagementRepository.ts`: ALL methods implemented — `updateProfile`, `replaceRoles` (via `replace_user_roles_for_tenant` RPC), `deactivateProfile`, `reactivateProfile`, `listActiveUsers`, all audit record methods
- `SupabaseAuthAdminAdapter.ts`: `disableUser` via `updateUserById(ban_duration: "876000h")`, `deleteUser` for compensation
- `SupabaseAuditRepository.ts`: Read-only audit port for querying entries

**Database (`supabase/migrations/`)**:
- `20250611000000_audit_triggers.sql`: AFTER INSERT/UPDATE/DELETE triggers on `user_profiles` that capture JSONB diffs automatically (changed fields only, sensitive keys redacted)
- `20250630000000_issue_27_tenant_user_constraints.sql`: Global uniqueness indexes on normalized email/phone, `user_profile_identifier_exists` function
- `20260609000000_replace_user_roles_for_tenant_rpc.sql`: Transactional role replacement with tenant validation
- `20250610000000_extend_audit_log.sql`: `audit_log` table with `old_value` and `new_value` JSONB columns

**Web (`apps/web/app/dashboard/admin_usuarios/`)**:
- `page.tsx`: `updateUserAction` and `deactivateUserAction` server actions already wired. UI renders update form (fullName, phone) and deactivate button per user.

### Affected Areas

| File | Role |
|------|------|
| `packages/domain/src/auth/user-management.ts` | Domain contracts — UPDATE EXISTS, may need `MutateTenantUserErrorCode` extension for phone uniqueness |
| `packages/application/src/auth/user-management.ts` | Orchestration — `updateUser()` EXISTS but has gaps |
| `packages/application/src/auth/effective-capabilities.ts` | Cache invalidation — `invalidate()` EXISTS but not called from update flow |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | DB I/O — ALL methods exist |
| `packages/infrastructure/src/auth/SupabaseAuthAdminAdapter.ts` | Auth provider — `disableUser()` exists |
| `apps/web/app/dashboard/admin_usuarios/page.tsx` | Server actions and UI — `updateUserAction` exists but doesn't pass `roleIds` |
| `supabase/migrations/20250610000000_extend_audit_log.sql` | Audit schema — exists with JSONB diff support |
| `openspec/specs/authorization-base/spec.md` | Existing spec that defines expectations for user management |
| `openspec/specs/audit-log-system/spec.md` | Audit spec defining JSON diff expectations |

### What's Already Implemented vs What's Missing

**Already done (no work needed)**:
- ✅ `updateUser` application use case (capability check, normalization, profile update, role replacement, audit)
- ✅ `deactivateUser` application use case (capability check, profile deactivation, Auth disable, compensation on failure)
- ✅ Block inactive users from login (app-session.ts status check)
- ✅ Hide inactive users from listings (listActiveUsers filters by status='active')
- ✅ `disableUser` in Auth admin adapter (ban_duration)
- ✅ Soft delete (status='inactive', no hard delete)
- ✅ Audit with JSON diff at DB trigger level for user_profiles changes
- ✅ Phone normalization and uniqueness at DB level (indexes + identifier_exists function)

**Gaps to implement**:

1. ❌ **Phone uniqueness in `updateUser`** — `updateUser` updates the profile without checking if the new phone belongs to a *different* user. The current `identifierExists` function checks globally but doesn't exclude the current user. Need either a new repository method `identifierExistsExcluding(userId)` or modify the check to exclude the target user.

2. ❌ **Capabilities cache invalidation on role change** — When `updateUser` replaces roles via `replaceRoles`, the target user's cached capabilities become stale. The `EffectiveCapabilitiesCache.invalidate()` exists but is never called from `updateUser`. The application use case needs access to the cache resolver and must call `invalidateEffectiveCapabilities({ tenantId, userId: targetUserId })` after role replacement.

3. ❌ **Role editing in update UI** — The update form in `admin_usuarios/page.tsx` only has `fullName` and `phone` fields. The `updateUserAction` doesn't read `roleIds` from FormData. Need to:
   - Add role checkboxes to the update form section (conditionally rendered when `canManageRoles` is true)
   - Pass `roleIds` from FormData in `updateUserAction`

### Dependencies Status (Issues 7, 10, 11)

| Issue | Actual Tracking | Status |
|-------|----------------|--------|
| Issue 7 (auth/authorization schema) | Completed as archived `2026-06-04-issue-17-auth-authorization-schema` | ✅ DONE — DB schema, profiles, roles, capabilities tables exist |
| Issue 10 (effective capabilities) | Completed as archived `2026-06-05-issue-23-effective-capabilities` | ✅ DONE — `EffectiveCapabilitiesCache`, resolver, `requireCapability` all implemented |
| Issue 11 (audit log system) | Completed as archived `2026-06-06-audit-log-system` and `openspec/specs/audit-log-system/spec.md` | ✅ DONE — Audit triggers, JSONB diff, `audit_log` table all in place |

All three dependencies are **fully implemented and live in the main codebase**.

### Approaches

1. **Direct gap-filling in existing code** (recommended)
   - Add `checkPhoneUniquenessForUpdate` method to `UserManagementRepository` domain contract and implement in Supabase repository
   - Add cache invalidation to `updateUser` flow in application layer by exposing the resolver through `UserManagementServiceDependencies`
   - Add role checkboxes to the update form in the admin_usuarios page
   - Effort: **Low** — each gap is <50 lines of change

2. **Create a new dedicated spec for issue #25**
   - Write delta specs, design, and tasks from scratch
   - Would follow full SDD cycle but adds overhead since most code is already written
   - Effort: **Medium** — bureaucratic overhead for small changes

3. **Minimal patch approach**
   - Only fix the most critical issues (phone uniqueness + cache invalidation)
   - Defer role checkboxes in UI to a follow-up
   - Effort: **Very Low** — but leaves UX incomplete

### Recommendation

**Approach 1: Direct gap-filling.** This is the right balance between completeness and effort:

1. Extend `UserManagementRepository` with `identifierExistsExcluding(userId, { email, phone? })` or overload the existing method with an optional exclude parameter
2. Implement the new method in `SupabaseUserManagementRepository` via a modified RPC call
3. Call the check in `updateUser` before updating the profile
4. Pass the effective capabilities resolver/cache to `UserManagementServiceDependencies` and call `invalidate(scope)` after role replacement in `updateUser`
5. Add role checkboxes to the update form and pass `roleIds` in `updateUserAction`
6. Add tests for phone uniqueness on update and cache invalidation

### Risks

1. **Duplicate audit entries**: The DB triggers already write JSONB diffs for `user_profiles` changes. The application layer also calls `recordUserUpdatedAudit` which writes a separate minimal entry. This means every update generates TWO audit entries. The existing tests expect both. Before changing this behavior, verify it's intentional (app-level = business semantic, trigger-level = row-level diff).

2. **Phone uniqueness check without RPC**: Currently `identifierExists` uses the `user_profile_identifier_exists` RPC. For the update path, a new RPC or a client-side exclusion is needed. The RPC is preferred for atomicity.

3. **Cache invalidation scope**: The `InMemoryEffectiveCapabilitiesCache` is in-memory per-server-instance. In a single-server deployment (current setup), this works fine. If horizontal scaling is in the future, a distributed cache (Redis) would be needed. For v1.1, the in-memory approach is adequate since cache is only for the user whose roles changed.

4. **`user.manage` vs `users:update`**: The issue description mentions `user.manage` permission, but the codebase uses `users:update` (seed migration `20250608000000`). These are the same capability — the issue text uses a shorthand label. No mapping needed.

### Ready for Proposal

**Yes.** The gaps are well-understood, small, and there's no architectural unclearity. The orchestrator should proceed to the proposal phase with the gaps listed under Approach 1.

Note: The change directory `openspec/changes/issue-25-user-edit-and-disable/` has been created with this exploration artifact.
