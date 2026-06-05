## Exploration: Esquema de autorización base (tenants, roles, capacidades, auditoría)

### Current State

The MVP 1.0 infrastructure phase is complete. The `tenants` table exists with `id`, `name`, `slug`, `timezone`, `currency`, `status`, `created_at`, `updated_at` — this matches phase 0/1 of the migration plan from `modelo-datos.md`. RLS is enabled on `tenants` using JWT `app_metadata.tenant_id`; storage bucket `tenant-files` exists with path-based RLS. The Supabase CLI stack is configured and the base migration applies cleanly.

What does NOT exist yet:
- `configuracion_tenant` (phase 1 — one row per tenant for operational flags)
- `capabilities` (phase 2 — global catalog)
- `user_profiles` (phase 2 — local profiles linked to Supabase Auth)
- `roles` (phase 2 — templates per tenant)
- `user_roles`, `role_capabilities`, `user_capability_overrides` (phase 2 — join tables)
- `audit_log` (phase 2)
- No test runner for DB-level migration validation (vitest exists at root level for infrastructure package only, no Supabase DB testing)
- `seed.sql` is an empty placeholder

The vault documentation is extensive and consistent:
- `modelo-datos.md` defines the schema, column types, constraints, and ordering for all 8 tables in the authorization domain
- `migraciones.md` maps them to phase 2 of the migration plan
- `reglas-integridad.md` documents every constraint, index, and co-tenancy rule
- `09-enunciado-parte-9.md` defines the role behavior (admin web, supervisor web, operador/mantenimiento/repartidor WhatsApp-only)
- `10-enunciado-parte-10.md` defines multitenant separation, timezone, currency, fuel_unit rules

Key design agreement: The vault docs and the GitHub issue agree on `phone` and `email` as globally unique (confirmed in issue comment: "Decisión confirmada: phone y email son únicos globalmente").

### Affected Areas

- `supabase/migrations/20250602000000_init_tenants_and_storage.sql` — Existing migration; must NOT be modified but its `tenants` table lacks `fuel_unit` column per `modelo-datos.md` (add in a new migration)
- `supabase/migrations/20250604XXXXXX_auth_authorization_schema.sql` — New migration to create all 8 tables for phase 2
- `supabase/seed.sql` — Needs to be populated with MVP capabilities seed data and base role definitions
- `openspec/specs/infraestructura-base/spec.md` — May need refinement on auth/authorization domain boundaries
- `packages/infrastructure/` — Future: test helpers for DB migration verification could live here
- `openspec/config.yaml` — `testing.runner` field may need updating after adding DB tests
- `obsidian-vault/07-database/migraciones.md` — Phase 2 migration plan already documented; implementation should track against it
- `obsidian-vault/07-database/modelo-datos.md` — Source of truth for column definitions; implementation should match exactly

### Approaches

1. **Single migration file (all tables)** — One new migration `20250604XXXXXX_auth_authorization_schema.sql` creating `capabilities`, `user_profiles`, `roles`, `user_roles`, `role_capabilities`, `user_capability_overrides`, `audit_log` in dependency order, plus an ALTER for `tenants.fuel_unit`.
   - Pros: Atomic deploy; simple ordering; matches migration phase 2 design; easy to review
   - Cons: Large single migration (~300+ lines); riskier rollback if partial failure (though Supabase CLI wraps in a transaction)
   - Effort: Medium

2. **Per-table migrations (split)** — One migration per table or logical group (auth domain, capabilities domain, audit domain).
   - Pros: Granular; easier to troubleshoot per-table; smaller individual SQL files
   - Cons: More files to manage; dependency ordering across files is fragile; Supabase CLI `migration up` applies in timestamp order, so timestamps must encode order
   - Effort: Medium-High

3. **Two-phase approach (struct + seed)** — Migration creates all tables, constraints, and triggers; a separate seed.sql update adds capabilities and base role definitions after the migration.
   - Pros: Clean separation between DDL and DML; seed can be re-run; aligns with `migraciones.md` phase 2 vs phase 9 distinction
   - Cons: Requires two deployment steps; seed data and schema are coupled in practice
   - Effort: Medium

### Recommendation

**Option 1 (single migration file) + Option 3's seed separation**: Create `20250604XXXXXX_auth_authorization_schema.sql` as a single migration containing ALL DDL for phase 2 tables (capabilities, user_profiles, roles, user_roles, role_capabilities, user_capability_overrides, audit_log, plus `ALTER TABLE tenants ADD COLUMN fuel_unit`). Then separately update `seed.sql` with the MVP capability seed list and a comment marking where future role-seed logic will go.

Rationale:
- Matches the existing migration pattern (single file per logical phase)
- Supabase CLI wraps each migration in a transaction, so atomicity is preserved
- The vault's migration plan already groups these as phase 2 — consistency reduces confusion
- Seed data is inherently riskier (business logic) and benefits from separate review

### Risks

- **Missing `fuel_unit` column in existing `tenants` table**: The current migration phase 1.0 has `tenants` without a `fuel_unit` column, but `modelo-datos.md` and the issue both require it. Must be added via ALTER TABLE in the new migration, not by editing the existing migration file.
- **`configuracion_tenant` table**: The vault's `modelo-datos.md` lists `configuracion_tenant` as phase 1 between `tenants` and `capabilities`, but the GitHub issue #17 does NOT mention it. The issue says "Crear migración de tenants" — but tenants already exists. This ambiguity means either: (a) `configuracion_tenant` should be included in this change, or (b) it's a separate change. The recommended approach: Exclude `configuracion_tenant` from this change and mark it as post-MVP or separate phase 1.5 issue.
- **No existing DB test infrastructure**: No Supabase DB tests exist. The issue requires "DB tests de constraints de unicidad, FK y cascadas, migración limpia/reset." The team must decide: (a) write raw SQL test scripts, (b) use `supabase test db` if available in CLI, or (c) skip DB testing for now and rely on manual verification.
- **Seed data verification blocking**: The vault docs explicitly mark the capabilities seed list as requiring technical verification against final use cases before migration. This is NOT a product blocker but must be validated before the seed.sql update.
- **Co-tenancy enforcement**: The vault docs specify co-tenancy (that FKs must reference rows from the same tenant). This is explicitly marked as "opcional en MVP" in `migraciones.md` and `reglas-integridad.md`. The issue does NOT mention co-tenancy. Recommend: skip co-tenancy triggers in MVP, enforce at application level as documented.
- **`audit_log` scope**: The issue specifies audit_log as "mínima" — the vault design includes `field`, `old_value`, `new_value` columns. These are not in the issue's table definition. Must decide if the vault's richer design should be implemented or minimized per issue scope.

### Ready for Proposal

**Yes** — but with clarification needed on these points before writing the proposal:

1. Should `configuracion_tenant` be included in this change or deferred? (Vault says it's in the base infra group, issue doesn't mention it)
2. Should `audit_log` include the detailed `field`/`old_value`/`new_value` columns from the vault design, or be minimal per issue scope?
3. Is there an existing Supabase DB test setup (`supabase test db` or similar) or should DB testing be deferred/manual?
4. Should `tenants.fuel_unit` be added via ALTER TABLE in the new migration to unify with the vault model?
