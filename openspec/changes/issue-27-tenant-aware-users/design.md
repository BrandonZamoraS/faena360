# Design: Tenant-Aware Users

## Technical Approach

Add tenant-aware user management as application-layer use cases over Supabase-backed ports. The current `production` tree is a skeleton (`packages/*/index.ts` only), so implementation must first restore/follow the auth patterns from issue #20/#23 branches: domain contracts in `packages/domain/src/auth`, orchestration in `packages/application/src/auth`, and Supabase I/O in `packages/infrastructure/src/auth`. The service must resolve tenant and actor from the existing `AppSession`, require `users:create` or `users:read`, normalize identifiers before preflight, create Supabase Auth first with `app_metadata.tenant_id`, persist local rows, compensate Auth on local failure, and audit successful creation using the current minimal `audit_log` contract.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Use case boundary | `UserManagementService` in `packages/application/src/auth/user-management.ts` | SQL/RPC-heavy flow or script-only flow | Matches issue #20/#23 hexagonal direction and keeps authorization/compensation explicit and testable. |
| Tenant source | Use `AppSession.tenant_id` and `AppSession.user_id`; never accept tenant input | Request-provided tenant id | Prevents cross-tenant leakage and follows app-session design: tenant comes from Auth metadata + local validation. |
| Persistence split | Auth port creates/deletes identity; repository port handles profile, roles, list, audit | One Supabase adapter method that does all logic | Keeps Supabase SDK in infrastructure while application owns workflow, rollback, and error vocabulary. |
| Compensation | Delete Auth identity if any local write/audit prerequisite after Auth creation fails | Leave orphan and rely on cleanup job | Spec requires immediate rollback; precedent exists in issue #19 onboarding. |

## Data Flow

Create:

```text
AppSession -> require users:create -> normalize/preflight global duplicates
  -> AuthAdmin.createUser(app_metadata.tenant_id)
  -> UserRepository.createProfile -> assignRoles -> recordAudit
  -> on local failure: AuthAdmin.deleteUser(authUserId)
```

List:

```text
AppSession -> require users:read -> UserRepository.listActiveUsersByTenant(session.tenant_id)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/domain/src/auth/user-management.ts` | Create | User input/result types, normalized identifiers, canonical error codes, `TenantUserSummary`. |
| `packages/domain/src/auth/index.ts` | Modify/Create | Export user-management contracts with existing auth contracts. |
| `packages/application/src/auth/user-management.ts` | Create | `createUser`/`listUsers` orchestration, capability checks, compensation, audit call. |
| `packages/application/src/auth/index.ts` | Modify | Export service, ports, and user-management interfaces. |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | Create | Global email/phone checks, local `user_profiles`, `user_roles`, active tenant listing, minimal audit insert. |
| `packages/infrastructure/src/auth/SupabaseAuthAdminAdapter.ts` | Create | `auth.admin.createUser` / `deleteUser` with `app_metadata.tenant_id`. |
| `packages/infrastructure/src/auth/index.ts` | Modify/Create | Export auth infrastructure adapters. |
| `supabase/migrations/*` | Modify/Create if needed | Ensure `user_profiles.status`, global unique email/phone, `users:create/read` seed, and audit compatibility exist. |
| `supabase/tests/authorization_constraints.sql` | Modify/Create | Constraint coverage for global duplicate and tenant-scoped roles. |

## Interfaces / Contracts

```ts
type CreateTenantUserInput = { email: string; temporaryPassword: string; fullName: string; phone?: string; roleIds: readonly string[] };
interface UserManagementRepository {
  identifierExists(input: { email: string; phone?: string }): Promise<boolean>;
  createProfile(input: { tenantId: string; authUserId: string; email: string; fullName: string; phone?: string }): Promise<string>;
  assignRoles(input: { tenantId: string; userId: string; roleIds: readonly string[] }): Promise<void>;
  listActiveUsers(input: { tenantId: string }): Promise<readonly TenantUserSummary[]>;
  recordUserCreatedAudit(input: { actorUserId: string; targetUserId: string }): Promise<void>;
}
```

Auth admin port returns `authUserId` and must support `deleteUser(authUserId)` for compensation.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Capability rejection, normalization, duplicate preflight, compensation after local failure | Vitest-style tests matching branch history under `packages/application/src/auth/*.test.ts`. |
| Adapter | Supabase query mapping and Auth Admin metadata/delete calls | Mock Supabase client like existing infrastructure tests in feature branches. |
| SQL | Global email/phone uniqueness and tenant role FK isolation | Extend Supabase SQL tests when migrations are restored. |

## Migration / Rollout

No destructive migration required. Add only missing additive schema/seed support after reconciling feature branches into the implementation branch.

## Open Questions

- [ ] Issue #26 audit artifact is not present in this checkout/branches; implementation should use current minimal `audit_log` unless #26 lands first.
- [ ] `production` lacks the auth/infrastructure package code found in feature branches; tasks must account for restoring those seams before issue #27 code.
