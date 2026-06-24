# Archive Report: issue-25-user-edit-and-disable

**Archived**: 2026-06-16
**Change**: feat(users): editar roles y desactivar usuarios
**Status**: COMPLETE

## Summary

Implemented three gap-fixes in the existing tenant-aware user management system (delivered by issue #27):
1. Phone uniqueness validation on user update (with self-exclusion)
2. Capabilities cache invalidation on role change
3. Role editing in the update UI form (including empty array support)

## What Changed

### Files Modified

| File | Layer | Change |
|------|-------|--------|
| `packages/domain/src/auth/user-management.ts` | Domain | Added `duplicate_identifier` error code; updated `identifierExistsExcluding` port to `{ userId, email, phone }`; added `getUserEmail` port |
| `packages/application/src/auth/user-management.ts` | Application | Added `capabilityInvalidator` to deps; phone uniqueness check in `updateUser`; cache invalidation after `replaceRoles` |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | Infrastructure | Implemented `identifierExistsExcluding` with direct RPC; added `getUserEmail` |
| `apps/web/app/dashboard/admin_usuarios/page.tsx` | Presentation | RoleCheckboxes in update form; `roleIdsPresent` hidden field; empty roles array support |
| `packages/application/src/auth/user-management.test.ts` | Tests | +4 unit tests (duplicate rejection, self-exclusion, cache invalidation, undefined skip) |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.test.ts` | Tests | +1 infrastructure test (RPC with email param) |
| `apps/web/app/dashboard/admin_usuarios/page.runtime.test.tsx` | Tests | +2 presentation tests (role checkboxes render/hide, empty roles) |

### Files Created

| File | Layer | Purpose |
|------|-------|---------|
| `supabase/migrations/20260616000000_issue_25_identifier_exists_exclude.sql` | Database | RPC `user_profile_identifier_exists` with optional `exclude_user_id` param |

## Verification

- **Tests**: 174 passed / 0 failed / 0 skipped (21 test files)
- **Typecheck**: All 5 packages pass
- **Lint**: Clean
- **Format**: All changed files compliant
- **Spec compliance**: 9/9 scenarios compliant

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `authorization-base` | Updated | Added phone uniqueness on update requirement + 2 new scenarios |
| `effective-capabilities` | Updated | Added cache invalidation on role change requirement + 1 new scenario |

## Known Issues / Technical Debt

1. **Ephemeral cache**: `InMemoryEffectiveCapabilitiesCache` is per-request. Invalidation is architecturally correct but functionally a no-op in the current single-server web architecture. Will become effective when moving to distributed cache.
2. **Module-level cache singleton**: Consider making `InMemoryEffectiveCapabilitiesCache` module-level for cross-request invalidation in future.

## Lessons Learned

1. **Clean Architecture discipline matters**: The initial implementation had `identifierExistsExcluding` with only `{ userId, phone }`, forcing infrastructure to do a compensatory DB query for email. The final fix corrected the domain port to declare all needed data (`{ userId, email, phone }`), keeping infrastructure honest and avoiding hidden coupling.
2. **Empty array vs omitted field**: FormData cannot distinguish "unchecked all" from "field not present". Using a hidden `roleIdsPresent` flag is a clean pattern to explicitly signal intent.

## SDD Cycle Complete

- [x] Explore
- [x] Proposal
- [x] Specs
- [x] Design
- [x] Tasks
- [x] Apply
- [x] Verify
- [x] Archive

Next step: Merge to main and deploy the Supabase migration.
