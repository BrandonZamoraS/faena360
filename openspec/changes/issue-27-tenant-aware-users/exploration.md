## Exploration: GitHub issue #27 — tenant-aware users

### Current State
- The checked-out tree is still a minimal skeleton: `packages/domain`, `packages/application`, and `packages/shared` only expose empty barrels, and there is no user-management code in the working tree.
- The useful auth/authorization architecture exists in branch history: issue #20 added `AuthUser`, `AppSession`, `SupabaseAuthAdapter`, `SupabaseAppSessionRepository`, and `user_profiles.status`; issue #23 added effective-capability resolution with cache/guard.
- Issue #19’s tenant onboarding script is the closest precedent for cross-system writes: validate first, create Supabase Auth with `app_metadata.tenant_id`, create local rows, and compensate in reverse on failure.
- The current authorization schema already enforces global `user_profiles.email` / `phone` uniqueness and tenant-scoped `roles` / `user_roles`; audit logging is still minimal, while issue #26 asks for richer change auditing.
- Vault source of truth: multitenancy, tenant isolation, web access only for admin/supervisor, auditability, and backend enforcement are explicit; no cross-tenant leakage is allowed.

### Affected Areas
- `packages/domain/src/auth/*` — user/profile/session/capability contracts likely need to be extended for user-management flows.
- `packages/application/src/auth/*` — existing session/capability patterns are the right place for `createUser` and `listUsers` use cases.
- `packages/infrastructure/src/auth/*` — Supabase Auth + DB repository adapters should own persistence/I/O.
- `supabase/migrations/20250604_auth_authorization_schema.sql` — current uniqueness + tenant-scoped auth tables define the boundary for new user writes.
- `supabase/migrations/20250609000000_add_user_profile_status.sql` — active/inactive profile status affects normal listing semantics.
- `supabase/tests/authorization_constraints.sql` — existing constraint tests show the expected cross-tenant and uniqueness rules.
- `openspec/specs/authorization-base/spec.md` and `openspec/specs/effective-capabilities/spec.md` — issue #27 sits on top of these specs.
- `openspec/changes/issue-19-create-tenant-with-admin/*` — rollback/preflight pattern for cross-system writes.
- `openspec/changes/archive/2026-06-05-issue-23-effective-capabilities/*` — proven capability resolver and cache/guard contract.

### Approaches
1. **Application use cases + Supabase adapters** — add `createUser` / `listUsers` in application, keep permission checks in application, use infrastructure only for Auth/DB I/O, and reuse the effective-capabilities resolver.
   - Pros: matches the current hexagonal direction, keeps Supabase out of business rules, makes compensation and audit orchestration explicit, and scales to future user-edit/list variants.
   - Cons: more files/seams; requires clear contracts for capability names, audit payloads, and rollback behavior.
   - Effort: Medium

2. **DB-heavy stored procedure/RPC flow** — push most user creation/listing logic into SQL/RPC and call Auth Admin only for identity creation.
   - Pros: fewer application files, some invariants live close to the data.
   - Cons: Auth user creation is still outside SQL transactions, compensation becomes awkward, and authorization/audit logic would be split across SQL and app code.
   - Effort: Medium

3. **Operator-script style workflow** — extend the issue #19 onboarding script pattern for user creation and keep listing in a thin app query layer.
   - Pros: easiest path for creation, reuses the existing compensation model.
   - Cons: it solves bootstrap/admin tooling better than the actual tenant-aware user feature set; listing and permission checks still need proper application services.
   - Effort: Low-Medium

### Recommendation
Use **Approach 1**. The repo’s strongest precedent is already split between application-level authorization and infrastructure-level Supabase I/O, and issue #27 needs the same separation to enforce tenant scope, normalize capability checks, and compensate safely across Auth + Postgres.

### Risks
- Capability vocabulary mismatch: issue #27 says `user.manage` / `user.read`, but the existing bootstrap/catalog uses `users:create` / `users:read` / `users:update`.
- Audit mismatch: issue #26 expects richer diffs, while the current schema only has minimal `audit_log` fields.
- Cross-system rollback is mandatory because Supabase Auth writes are not transactionally tied to Postgres.
- Local checkout does not yet contain the auth/user code; the implementation must follow branch history and the source-of-truth docs, not the current skeleton.

### Ready for Proposal
Yes — but first confirm whether issue #27 should use the existing `users:*` capability keys or introduce `user.manage` / `user.read` aliases, and confirm the audit payload expected for creation events.

Fuentes vault: obsidian-vault/01-producto/enunciado-sistema/09-enunciado-parte-9.md, obsidian-vault/01-producto/enunciado-sistema/10-enunciado-parte-10.md, obsidian-vault/01-producto/enunciado-sistema/12-enunciado-parte-12.md
