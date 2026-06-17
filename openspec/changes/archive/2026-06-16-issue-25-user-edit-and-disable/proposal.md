# Proposal: Edit Roles and Deactivate Users (Issue #25)

## Intent

Fill three implementation gaps discovered during exploration: phone uniqueness validation on update, capabilities cache invalidation on role change, and role checkboxes in the update form. ~85% of issue #25 is already implemented via issue #27. Dependencies #7, #10, #11 are completed.

## Scope

### In Scope
- Phone uniqueness validation in `updateUser` flow (application layer)
- Capabilities cache invalidation after role replacement in `updateUser`
- Role checkboxes in the admin users update form (web layer)

### Out of Scope
- Deactivate/reactivate flow (already fully implemented)
- Inactive user login blocking (already done)
- Audit system changes (DB triggers already capture diffs)
- Capability code `user.manage` — existing `users:update` covers this

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `authorization-base`: Clarify phone uniqueness enforcement applies to both create and update paths
- `effective-capabilities`: Clarify cache invalidation MUST be triggered on role changes, not just available

## Approach

Direct gap-filling in existing code following hexagonal architecture:

1. **Phone uniqueness on update**: Add `identifierExistsExcluding(userId, { email, phone? })` to `UserManagementRepository` contract. Implement via modified `user_profile_identifier_exists` RPC (add optional `exclude_user_id` param). Call in `updateUser` before `updateProfile`.
2. **Cache invalidation**: Expose `EffectiveCapabilitiesResolver` through `UserManagementServiceDependencies`. Call `invalidate({ tenantId, userId })` after `replaceRoles` in `updateUser`.
3. **Update form role UI**: Add role checkboxes to the update form in `admin_usuarios/page.tsx` (gated by `canManageRoles`). Pass `roleIds` from FormData in `updateUserAction`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/auth/user-management.ts` | Modified | New `identifierExistsExcluding` contract |
| `packages/application/src/auth/user-management.ts` | Modified | Phone check + cache invalidation calls |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | Modified | Implement exclusion RPC |
| `supabase/migrations/` | Modified | Update RPC with optional `exclude_user_id` |
| `apps/web/app/dashboard/admin_usuarios/page.tsx` | Modified | Role checkboxes in update form |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplicate audit entries (app-level + trigger) | Low | Existing tests expect both; no change needed |
| RPC change breaks create flow | Low | Additive param only, backward-compatible |
| Cache invalidation limited to single instance | Low | Single-server deployment adequate for v1.1 |

## Rollback Plan

- Phone uniqueness: revert `updateUser` to skip `identifierExistsExcluding` call
- Cache invalidation: remove the `invalidate()` call from `updateUser` flow
- UI: remove role checkboxes from update form section
- All changes are additive, no DB migration rollback needed

## Dependencies

None — issues #7, #10, #11 all completed and live.

## Success Criteria

- [ ] `updateUser` rejects phone numbers already in use by another user
- [ ] `updateUser` invalidates target user's capabilities cache after role change
- [ ] Update form shows role checkboxes when user has `canManageRoles`
- [ ] All 166 existing tests continue passing
- [ ] New tests cover phone uniqueness on update and cache invalidation
