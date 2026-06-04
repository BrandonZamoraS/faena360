# Design: Auth Authorization Schema Base

## Technical Approach

Add one Supabase SQL migration after `20250602000000_init_tenants_and_storage.sql`. The existing `tenants` table stays owned by infrastructure base; this change only `ALTER`s it to add `fuel_unit`, then creates the issue #17 authorization tables in FK order. No RLS, Auth adapter, tenant bootstrap, `configuracion_tenant`, or rich audit model is included.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tenant evolution | Add `tenants.fuel_unit` in a new migration | The base migration already exists; editing it would break applied environments. |
| Role model | `roles` belongs to `tenants`; `user_roles` references `roles.id` | Matches issue wording and keeps assignments stable if role names change. |
| Capability catalog | Global `capabilities` table, joined through role grants and user overrides | Supports effective capabilities without duplicating definitions per tenant. |
| Constraints | DB-level `UNIQUE`, FK, and check constraints | Acceptance criteria are persistence guarantees, not application behavior. |
| Audit scope | Minimal `audit_log` with actor, target, action, occurred timestamp | The user explicitly limited scope to issue #17; richer vault-only columns are excluded. |
| Tests | Add DB verification assets outside Vitest | Current repo has Vitest for TS packages but no DB harness; schema behavior must be verified in Postgres. |

## Data Flow

```text
auth.users ──→ user_profiles ──→ user_roles ──→ roles ──→ role_capabilities ──→ capabilities
                      │                            │
                      └── user_capability_overrides┘

authorization change ──→ audit_log(actor, target, action, occurred_at)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20250604_auth_authorization_schema.sql` | Create | Adds `fuel_unit`, authorization tables, constraints, indexes, and `updated_at` triggers. Use final timestamped filename generated during implementation. |
| `supabase/tests/authorization_constraints.sql` | Create | DB-level checks for uniqueness, FK/cascade behavior, and clean migrated schema, executed against local Supabase/Postgres. |
| `supabase/seed.sql` | Modify only if needed | Keep empty unless tests require static capability rows; no tenant/admin bootstrap seed. |

## Interfaces / Contracts

Migration order:
1. `ALTER TABLE tenants ADD COLUMN fuel_unit text NOT NULL DEFAULT 'liters' CHECK (...)`.
2. `user_profiles`: `tenant_id -> tenants(id)`, `auth_user_id -> auth.users(id)`, global unique `email`, `phone`, `auth_user_id`, timestamps.
3. `capabilities`: global catalog with unique stable key/name and timestamps.
4. `roles`: `tenant_id -> tenants(id)`, `name`, `is_system`, `is_web_access`, unique `(tenant_id, name)`, timestamps.
5. `role_capabilities`: unique `(role_id, capability_id)`, cascade on role/capability delete.
6. `user_roles`: unique `(user_id, role_id)`, cascade on user/role delete.
7. `user_capability_overrides`: `grant_type CHECK IN ('allow','deny')`, unique `(user_id, capability_id)`, cascade on user/capability delete.
8. `audit_log`: minimal actor/target/action/occurred_at; FK delete should preserve history by setting nullable actor/target user refs to null rather than cascading audit rows.

Indexes: add tenant lookup indexes on `user_profiles.tenant_id`, `roles.tenant_id`; join indexes on FK columns not already covered by unique constraints. Reuse existing `set_updated_at()` for mutable tables.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| DB migration | Clean reset applies all migrations | `supabase db reset` locally before constraint scripts. |
| DB constraints | Duplicate `email`, `phone`, `auth_user_id`, `(tenant_id,name)`, `(user_id,role_id)`, `(role_id,capability_id)`, `(user_id,capability_id)` fail | SQL test file with transactions/savepoints expecting constraint errors. |
| DB FK/cascade | Deleting roles/users/capabilities removes join rows; audit rows survive | SQL assertions against local Postgres after inserts/deletes. |
| App unit | None | No TS interfaces change in this issue. |

## Migration / Rollout

Roll out by applying the new migration after infrastructure base. Existing tenants receive the default `fuel_unit`; later updates can set tenant-specific values manually. Rollback is migration revert plus `supabase db reset` in local/dev; in shared environments, drop authorization tables in reverse dependency order and remove `tenants.fuel_unit` only if no downstream data depends on it.

## Open Questions

- [ ] What exact `fuel_unit` values should the check allow? Issue requires a check but does not name the allowed set.
- [ ] Should `audit_log.target` be a generic `(target_table, target_id)` or constrained to user targets only? Issue only says `audit_log`; spec says actor/target/action/timestamp.
