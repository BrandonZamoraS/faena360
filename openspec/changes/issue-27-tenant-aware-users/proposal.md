# Proposal: Tenant-Aware Users

## Intent

Allow authorized tenant users to create and list users inside their own tenant only. The change must prevent cross-tenant leakage, reuse the existing auth/session direction, and define explicit compensation because Supabase Auth and Postgres writes are not transactional together.

## Scope

### In Scope
- Add backend `createUser` and `listUsers` tenant-scoped use cases.
- Create Supabase Auth users with `app_metadata.tenant_id`, then create local profile and role rows with compensation on downstream failure.
- Enforce capability checks, global email/phone uniqueness, active-only default listings, and creation audit logging.

### Out of Scope
- Edit/deactivate users, password recovery, delivery of credentials, and UI flows.
- Audit-schema expansion beyond what issue #26 already defines.

## Capabilities

### New Capabilities
- `tenant-aware-users`: Tenant-scoped user creation and active-user listing with authorization, uniqueness validation, audit logging, and rollback rules.

### Modified Capabilities
- None.

## Approach

Use application-layer orchestration over infrastructure adapters. Resolve the effective tenant from the authenticated session, validate permissions before writes/reads, normalize email/phone before uniqueness checks, create the Auth identity first, persist local rows second, and compensate in reverse order if any local step fails. Treat issue wording `user.manage` / `user.read` as a proposal-level mismatch to resolve against the canonical capability catalog during specs.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/application/src/auth/*` | Modified | `createUser` / `listUsers` orchestration and permission checks |
| `packages/domain/src/auth/*` | Modified | User-management contracts, errors, audit intent |
| `packages/infrastructure/src/auth/*` | Modified | Supabase Auth + DB persistence adapters |
| `supabase/migrations/*` | Modified | Support local user/profile/role writes and audit compatibility |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Capability key mismatch with existing catalog | High | Specs MUST define canonical keys before implementation |
| Audit contract depends on issue #26 richness | Med | Scope creation audit to current contract and note dependency |
| Partial failure after Auth creation | High | Require explicit compensation and rollback verification |

## Rollback Plan

Revert new application and infrastructure wiring, remove related migration changes, and disable the user-management entry points. If deployment fails after Auth-user creation, execute compensation to remove orphaned Auth users created by this flow.

## Dependencies

- Issue #19 compensation precedent.
- Issue #20 app-session auth flow.
- Issue #23 effective-capabilities resolver.
- Issue #26 audit contract confirmation.

## Success Criteria

- [ ] Authorized tenant admins can create users only inside their effective tenant.
- [ ] Authorized readers list only active users from their effective tenant.
- [ ] Duplicate global email/phone creation fails, creation is audited, and partial failures are compensated.
