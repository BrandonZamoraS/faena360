# Proposal: Effective Capabilities Resolver

## Intent

Implement issue #23 on top of `development`: an application-layer ABAC resolver that combines tenant user roles, role capabilities, and user overrides with deny-by-default behavior.

## Scope

### In Scope
- Domain types for tenant users, roles, capability codes, and overrides.
- `getEffectiveCapabilities(userId, tenantId)` resolver behind repository/cache ports.
- Short-TTL in-memory cache by `tenant_id:user_id` plus invalidation API.
- `requireCapability` guard that throws `capability_denied`.
- Vitest coverage for role union, overrides, cache, invalidation, and guard behavior.

### Out of Scope
- Supabase repository adapter.
- Session adapter integration pending issue #20 contract.
- Distributed cache and UI permissions management.

## Capabilities

### New Capabilities
- `effective-capabilities`: Tenant-scoped capability resolution for authorization guards.

### Modified Capabilities
- None.

## Approach

Use domain/application packages already present in `development`. Keep database/session dependencies as ports so infrastructure can implement them when prerequisite schemas are stable.

## Risks

| Risk | Mitigation |
|------|------------|
| Missing DB/session adapter contracts | Expose explicit ports and keep adapters out of this PR |
| Cache invalidation source events not wired | Provide invalidation API for future infrastructure hooks |

## Rollback Plan

Remove the new auth domain/application files, tests, package dependency, and OpenSpec change folder.

## Success Criteria

- [ ] Unit tests cover empty roles, role union, allow, deny, cache reuse/invalidation, and guard denial/success.
- [ ] Typecheck and build pass on the branch from `development`.
