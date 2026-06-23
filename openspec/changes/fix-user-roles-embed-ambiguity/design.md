# Design: Fix User Roles Embed Ambiguity

## Technical Approach

Fix the schema, not the repository query. Add a cleanup migration that drops only the redundant `user_roles_user_id_tenant_id_fkey` relationship after confirming the original `(tenant_id, user_id) -> user_profiles(tenant_id, id)` relationship exists. This leaves one unambiguous PostgREST relationship from `user_profiles` to `user_roles` while preserving tenant isolation with the profile FK and the existing `(tenant_id, role_id) -> roles(tenant_id, id)` FK.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Primary fix | Drop redundant `user_roles_user_id_tenant_id_fkey` via migration | Disambiguate embed in TypeScript only | Code disambiguation treats the symptom and leaves schema ambiguity for future embeds. Schema cleanup matches the actual invariant: one tenant-aware profile relationship. |
| Safety check | Migration verifies original profile FK exists before drop | Blind `alter table drop constraint` | Prevents accidentally weakening tenant isolation in drifted databases. |
| Tests | Extend SQL constraint coverage for cross-tenant `user_roles` inserts | Only verify UI loads | The bug came from DB relationships; tests must prove the correction keeps DB enforcement intact. |
| Temporary hotfix | Use `user_roles!<constraint>(role_id)` only if urgent | Ship both as permanent | Useful for immediate recovery, but permanent state should keep schema simple and unambiguous. |

## Data Flow

```text
admin_usuarios
  -> SupabaseUserManagementRepository.listActiveUsers
  -> user_profiles select (..., user_roles(role_id))
  -> PostgREST sees one user_profiles <-> user_roles FK
  -> tenant-scoped users + role_ids returned
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<next>_fix_user_roles_embed_ambiguity.sql` | Create | Guarded migration: confirm original profile FK, drop `user_roles_user_id_tenant_id_fkey` if present, keep tenant/role constraints. |
| `supabase/tests/authorization_constraints.sql` | Modify | Add assertions that same-tenant assignment succeeds and cross-tenant profile/role assignments fail after duplicate FK cleanup. |
| `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | No planned change | Keep `user_roles(role_id)` once schema has a single relationship; only consider explicit embed constraint as a temporary hotfix. |

## Interfaces / Contracts

Required post-migration DB contract:

```sql
-- user_roles keeps tenant-aware membership integrity
foreign key (tenant_id, user_id) references user_profiles(tenant_id, id) on delete cascade;
foreign key (tenant_id, role_id) references roles(tenant_id, id) on delete cascade;
unique (tenant_id, user_id, role_id);
```

The redundant inverse-order profile FK `user_roles_user_id_tenant_id_fkey` must not exist after the migration.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| SQL constraints | Same-tenant role assignment succeeds; cross-tenant profile and role assignment fail | Extend `supabase/tests/authorization_constraints.sql` with savepoint-based assertions. |
| Runtime smoke | Admin users query no longer throws embed ambiguity | Exercise `admin_usuarios` after `supabase db reset`/migration or repository integration smoke if available. |
| Quality | Repository unchanged, migration syntax valid | Run existing SQL test command and normal project checks during apply/verify. |

## Implementation Handoff

### Execution Order

1. Create `supabase/migrations/<next>_fix_user_roles_embed_ambiguity.sql` with guarded duplicate-FK cleanup.
2. Extend `supabase/tests/authorization_constraints.sql` for cross-tenant `user_roles` protection.
3. Reset/apply local DB, refresh PostgREST schema cache if needed, and verify `admin_usuarios` query.

### Apply Slices

| Slice | Goal | Files to Read/Edit | Acceptance | Verification |
|---|---|---|---|---|
| 1 | Remove duplicate relationship safely | `supabase/migrations/20250603000000_create_onboarding_tables.sql`, `supabase/migrations/20250630000000_issue_27_tenant_user_constraints.sql`, new migration | Redundant FK absent; original profile FK and role FK remain | Query `pg_constraint`; `supabase db reset` when authorized |
| 2 | Prove tenant isolation survives | `supabase/tests/authorization_constraints.sql` | Same-tenant insert passes; cross-tenant profile/role inserts fail | `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/authorization_constraints.sql` |
| 3 | Runtime smoke | `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts` | `listActiveUsers` no longer throws PostgREST ambiguity | Manual `admin_usuarios` load or targeted repository smoke |

### Constraints for Apply

- Do not remove the original `(tenant_id, user_id)` profile FK.
- Do not weaken `(tenant_id, role_id)` role ownership enforcement.
- Do not replace the schema fix with permanent PostgREST embed disambiguation unless owner explicitly chooses a hotfix-first path.

## Migration / Rollout

Apply as a forward-only cleanup migration. Rollback, if needed, can re-add `user_roles_user_id_tenant_id_fkey`, but that reintroduces PostgREST ambiguity; prefer restoring only if a drifted database lacked the original FK and the safety guard blocked the intended migration. After deploy, refresh/restart Supabase/PostgREST schema cache if ambiguity persists.

## Open Questions

- [ ] What exact timestamp should the migration use in apply? Use the next chronological migration filename at implementation time.
- [ ] Does the target Supabase deployment auto-refresh schema cache after migrations, or does it need an explicit restart/NOTIFY?
