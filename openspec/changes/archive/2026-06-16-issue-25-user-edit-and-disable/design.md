# Design: Edit Roles and Deactivate Users (Issue #25)

## Technical Approach

Fill three implementation gaps in the existing hexagonal user-management flow:

1. **Phone uniqueness on update**: Extend the repository contract with self-exclusion, wire the check into `updateUser` before profile mutation, and back it with a backward-compatible RPC change.
2. **Capabilities cache invalidation on role change**: Add a focused invalidation port to application dependencies; call it after `replaceRoles` succeeds in `updateUser`.
3. **Role editing in update form**: Surface the existing `roleIds` contract field in the presentation layer by adding checkboxes to the update form and reading them from FormData.

All changes are additive; no existing behavior is removed.

## Architecture Decisions

| Decision | Option A (chosen) | Option B | Rationale |
|----------|-------------------|----------|-----------|
| Self-exclusion API | `identifierExistsExcluding(userId, {email, phone?})` on `UserManagementRepository` | Client-side filter after `identifierExists` | RPC-level exclusion is atomic and avoids race conditions; matches existing RPC pattern. |
| RPC backward compatibility | Add optional `exclude_user_id` param to existing `user_profile_identifier_exists` | Create new RPC | One RPC to maintain; `default null` keeps create path untouched. |
| Cache invalidation port | Add `{invalidate(scope)}` object to `UserManagementServiceDependencies` | Pass full `EffectiveCapabilitiesCache` | Application only needs `invalidate`; smaller port respects ISP and avoids leaking cache internals. |
| Invalidation timing | After successful `replaceRoles` | Before `replaceRoles` | If role replacement fails, capabilities never changed — no need to invalidate. |
| UI role checkboxes placement | Same `<RoleCheckboxes>` component reused in update form | Separate component | Existing component has no create-specific logic; reuse keeps UI consistent. |

## Data Flow

### Phone Uniqueness Check (update path)

```
updateUserAction (infra)
  → updateUser (app)
    → requireCapability(users:update)
    → requireCapability(roles:update)   [if roleIds present]
    → repository.identifierExistsExcluding(targetUserId, {phone?})
      → RPC user_profile_identifier_exists(lookup_email, lookup_phone, exclude_user_id)
        → [DB] normalized uniqueness check excluding self
    → [if exists] return {ok:false, code:"duplicate_identifier"}
    → repository.updateProfile(...)
    → [if roleIds] repository.replaceRoles(...)
    → [if roleIds] capabilityInvalidator.invalidate({tenantId, userId})
    → repository.recordUserUpdatedAudit(...)
    → return {ok:true}
```

### Cache Invalidation

```
updateUser (app)
  → replaceRoles succeeds
  → capabilityInvalidator.invalidate({tenantId, userId: targetUserId})
    → InMemoryEffectiveCapabilitiesCache.delete(key)
      → next getEffectiveCapabilities → cache MISS → fresh DB read
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/domain/src/auth/user-management.ts` | Modify | Add `duplicate_identifier` to `MutateTenantUserErrorCode`; add `identifierExistsExcluding` to `UserManagementRepository` |
| `packages/application/src/auth/user-management.ts` | Modify | Add `capabilityInvalidator` to `UserManagementServiceDependencies`; call `identifierExistsExcluding` and `invalidate` in `updateUser` |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | Modify | Implement `identifierExistsExcluding` via RPC with `exclude_user_id` |
| `supabase/migrations/` | Add migration | Alter `user_profile_identifier_exists` to accept optional `exclude_user_id uuid default null` |
| `apps/web/app/dashboard/admin_usuarios/page.tsx` | Modify | Add `<RoleCheckboxes>` to update form (gated by `canManageRoles`); read `roleIds` from FormData in `updateUserAction`; wire `capabilityInvalidator` in `buildUserManagementService` |

## Interfaces / Contracts

### Domain (`packages/domain/src/auth/user-management.ts`)

```typescript
export type MutateTenantUserErrorCode =
  | "missing_tenant"
  | "missing_user"
  | "capability_denied"
  | "duplicate_identifier"   // NEW
  | "profile_update_failed"
  | "role_assignment_failed"
  | "audit_failed";

export interface UserManagementRepository {
  identifierExists(input: {
    readonly email: string;
    readonly phone?: string;
  }): Promise<boolean>;

  identifierExistsExcluding(input: {     // NEW
    readonly userId: string;
    readonly email: string;
    readonly phone?: string;
  }): Promise<boolean>;

  // ... existing methods
}
```

### Application (`packages/application/src/auth/user-management.ts`)

```typescript
export interface UserManagementServiceDependencies {
  readonly authAdmin: AuthAdminPort;
  readonly repository: UserManagementRepository;
  readonly capabilityChecker: {
    requireCapability(scope: CapabilityScope, capabilityCode: string): Promise<unknown>;
  };
  readonly capabilityInvalidator?: {      // NEW
    invalidate(scope: CapabilityScope): Promise<void>;
  };
}
```

### Infrastructure RPC (`supabase/migrations/`)

```sql
create or replace function public.user_profile_identifier_exists(
  lookup_email text,
  lookup_phone text default null,
  exclude_user_id uuid default null      -- NEW
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where (exclude_user_id is null or up.id != exclude_user_id)   -- NEW
      and (
        public.normalize_identifier_email(up.email) = public.normalize_identifier_email(lookup_email)
        or (
          lookup_phone is not null
          and up.phone is not null
          and public.normalize_identifier_phone(up.phone) = public.normalize_identifier_phone(lookup_phone)
        )
      )
  );
$$;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (domain) | `MutateTenantUserErrorCode` includes `duplicate_identifier` | Type-level assertion in existing test file |
| Unit (application) | `updateUser` rejects duplicate phone via `identifierExistsExcluding`; `updateUser` calls `invalidate` after `replaceRoles`; self-exclusion allows same phone | Extend `packages/application/src/auth/user-management.test.ts` with mock-based scenarios |
| Unit (infrastructure) | `identifierExistsExcluding` normalizes input and passes `exclude_user_id` to RPC | Extend `packages/infrastructure/src/auth/SupabaseUserManagementRepository.test.ts` with mock RPC call assertions |
| Unit (presentation) | Update form renders role checkboxes when `canManageRoles` is true; `updateUserAction` reads `roleIds` from FormData | Extend `apps/web/app/dashboard/admin_usuarios/page.runtime.test.tsx` (existing runtime test) |
| Build | No type regressions | `pnpm -r typecheck` |

## Migration / Rollout

1. **DB migration**: Additive optional parameter on existing RPC — no data migration, no rollback risk.
2. **Application deploy**: New code paths are gated by existing contracts; old callers of `identifierExists` are untouched.
3. **Cache invalidation**: If `capabilityInvalidator` is not provided (undefined), `updateUser` skips invalidation gracefully — backward-compatible for test setups.

No feature flags required.

## Open Questions

- None — all contracts and wiring patterns are established in the codebase.
