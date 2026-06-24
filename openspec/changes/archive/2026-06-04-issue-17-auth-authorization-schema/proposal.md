# Proposal: Auth authorization schema base

## Intent

Deliver the minimum PostgreSQL authorization schema required by issue #17 so MVP auth can model tenant-bound roles, effective capabilities, and minimal audit history with reproducible Supabase migrations.

## Scope

### In Scope
- Add one phase migration for `user_profiles`, `roles`, `user_roles`, `capabilities`, `role_capabilities`, `user_capability_overrides`, `audit_log`, plus `tenants.fuel_unit`.
- Add required unique constraints, FKs, enums/checks, indexes, and `updated_at` helpers.
- Add DB verification for uniqueness, FK/cascade behavior, and clean reset/apply.

### Out of Scope
- `configuracion_tenant`, RLS/policies, Supabase Auth adapter, tenant bootstrap scripts.
- Rich `audit_log` fields beyond the issue minimum and any UI/API authorization workflows.

## Capabilities

### New Capabilities
- `authorization-base`: Multitenant authorization persistence for local user profiles, tenant roles, capability catalog, role assignments, user overrides, and minimal audit records.

### Modified Capabilities
- `infraestructura-base`: Extend tenant foundation data so the base tenant schema also requires `fuel_unit` with UTC-safe timestamps preserved.

## Approach

Create a single new Supabase migration for the full DDL in dependency order, keeping seed/data concerns separate. Update or add DB-level verification assets to prove clean migration, uniqueness failures, and expected FK cascades.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*auth_authorization_schema.sql` | New | Authorization tables, constraints, checks, indexes, helpers, `tenants.fuel_unit` alter |
| `supabase/seed.sql` | Modified | Minimal capability seed data only if needed by tests/change flow |
| `openspec/specs/infraestructura-base/spec.md` | Modified | Add `fuel_unit` to tenant foundation requirement |
| `openspec/specs/authorization-base/spec.md` | New | Source-of-truth behavior for auth schema capability |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| No DB test harness exists yet | Med | Define minimal Supabase DB verification path during specs/design |
| Large migration hides dependency mistakes | Med | Keep strict creation order and verify from clean reset |

## Rollback Plan

Revert the new migration and related spec delta, run a clean Supabase reset, and remove any seed/test assets introduced by this change.

## Dependencies

- Infraestructura base 1.0 already applied.
- Supabase migration/reset workflow available in the repo.

## Success Criteria

- [ ] A clean reset applies the authorization migration with no errors.
- [ ] Global uniqueness, tenant-role uniqueness, duplicate assignment prevention, and expected FK cascades are verified at DB level.
