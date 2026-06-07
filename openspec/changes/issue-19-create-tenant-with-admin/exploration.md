## Exploration: Create tenant with admin script (issue-19)

### Current State

**Database schema (3 migrations applied):**

1. `20250602000000_init_tenants_and_storage.sql` — `tenants` table (id, name, slug, timezone, currency, status), storage bucket `tenant-files`, RLS on `tenants`, `set_updated_at()` helper.
2. `20250604_auth_authorization_schema.sql` — Added `fuel_unit` to `tenants`, then created `user_profiles`, `capabilities`, `roles`, `role_capabilities`, `user_roles`, `user_capability_overrides`, `audit_log` with unique constraints, FKs, composite FKs, and trimming triggers.
3. `20250606000000_rls_multitenant_isolation.sql` — Added `current_app_tenant_id()` helper; added `tenant_id` to `audit_log` and `user_capability_overrides` with backfill guards; enabled RLS on all auth tables; composite FK `uco_user_tenant_fk`; `validate_audit_log_tenant()` trigger; append-only `audit_log` UPDATE policy.

**Existing test files (2):**
- `supabase/tests/authorization_constraints.sql` (815 lines) — 27 tests: uniqueness, FK cascade, audit SET NULL, fuel_unit/grant_type check, cross-tenant role/user rejection, composite FK mismatch, trigger validation.
- `supabase/tests/rls_multitenant_isolation.sql` (658 lines) — 22 tests: same-tenant access, cross-tenant denial per table, null-safe audit access, delete deny, JWT missing claim, composite FK cross-tenant rejection, trigger cross-tenant rejection.

**Seed data:**
- `supabase/seed.sql` is a 3-line placeholder: "Seed data is intentionally empty in phase 1.0. Tenants and initial users are created manually by the developer/support team."
- No capability seed data, no role definitions, no default role_capability mappings exist in the repo.
- The vault's `migraciones.md` phase 9 defines the seed plan (capabilities + 5 base roles) but it has NOT been implemented.

**Vault model (`modelo-datos.md`):**
- 5 base roles per tenant: `administrador` (admin), `supervisor`, `operador`, `mantenimiento`, `repartidor_de_combustible`
- `is_web_access = true` on admin + supervisor; `false` on the other three
- `is_system = true` on all five (predefined, not editable by tenant admin)
- Capabilities seed list documented (17 capabilities across `catalog`, `user`, `jornada`, `solicitud`, `expense` modules) but marked "verificar antes de migrar"
- Each role maps to specific capability grants (not fully detailed in vault — marked for implementation)

**Key gap:** The vault explicitly says (in `migraciones.md` section 3.3): "La creación del primer user_profiles + rol administrador para un nuevo tenant es un proceso manual de onboarding." This is exactly what issue-19 needs to automate.

**Supabase Auth config (`config.toml`):**
- `enable_signup = true`
- `enable_confirmations = false` (no email confirmation needed)
- JWT expiry: 3600s
- No MFA configured

### Affected Areas

- **`supabase/scripts/`** (new directory) — Where the command/script will live. No scripts exist yet in the repo.
- **`supabase/seed.sql`** — Should remain empty for seed data; the tenant+admin creation is a runtime process, not seed data.
- **`supabase/docs/`** — New runbook document for the manual process.
- **`openspec/specs/authorization-base/spec.md`** — May need updated scenarios for tenant+admin creation.
- **`openspec/specs/infraestructura-base/spec.md`** — The tenant scenario currently assumes tenant exists; no "create tenant" flow is specified.
- **`supabase/tests/`** — Need new integration test SQL file for the create-tenant-with-admin flow.
- **`packages/`** — If choosing a TypeScript script, it could live in `packages/scripts/` or `packages/cli/`.
- **`apps/web/`** — Not affected (no UI changes in scope), but the service role key pattern from the backend is relevant.

### Approaches

#### Approach 1: SQL/PL/pgSQL procedure (raw SQL + supabase CLI for Auth)

A stored procedure `create_tenant_with_admin()` that handles all DB operations in a transaction, combined with a shell wrapper that calls `supabase` CLI for Auth user creation and then calls the procedure.

- **Effort**: Medium
- **Pros**: DB operations are atomic in a single transaction; no TypeScript compilation needed; matches existing SQL test patterns; can leverage existing `set_updated_at()` and trigger infrastructure
- **Cons**: **Cannot create Supabase Auth users from PL/pgSQL** — must either (a) insert directly into `auth.users` internal schema (fragile, unsupported), or (b) call Auth Admin API externally via `supabase` CLI or HTTP. Direct `auth.users` insert bypasses password hashing, email confirmation logic, and the Auth service entirely. The shell wrapper (`psql` + `supabase` CLI) has primitive error handling and no atomic compensation between Auth and DB.

#### Approach 2: TypeScript script with supabase-js Admin client (recommended)

A self-contained TypeScript script using `@supabase/supabase-js` with the service role key. Orchestrates both Auth (user creation via `admin.auth.createUser()`) and DB operations (via `admin.from().insert()`). Uses a compensation/rollback pattern.

- **Effort**: Medium
- **Pros**: Single runtime (tsx/node); proper error handling with try/catch; can validate IANA timezone via `Intl.supportedValuesOf('timeZone')` and ISO 4217 via a built-in list; supabase-js Admin client handles both Auth API and DB operations; atomic compensation is feasible (track created resources, roll back on failure); matches project stack (TypeScript, pnpm); can be placed in a reusable `packages/cli/` package for future scripts
- **Cons**: Requires `tsx` or `ts-node` to run; needs `SERVICE_ROLE_KEY` as env var; more lines of code than a pure SQL approach; introduces a new package dependency

#### Approach 3: Shell script with psql raw SQL and direct Supabase Auth REST API

A bash/PowerShell script that: (1) validates inputs, (2) calls Supabase Auth REST API `/auth/v1/admin/users` with service role key to create the user and capture the `auth_user_id`, (3) calls psql with heredoc SQL to create tenant, roles, profile, role assignment, audit entry, all in one DB transaction; (4) compensates on failure.

- **Effort**: Medium-High
- **Pros**: No TypeScript compilation; can use `curl` for Auth API + `psql` for DB; no extra dependencies beyond curl and psql
- **Cons**: Shell error handling is primitive; platform-dependent (bash vs PowerShell); passing complex JSON payloads in shell is error-prone; compensation requires tracking state manually; shell heredocs for multi-line SQL are fragile with string interpolation; password with special chars can break shell quoting

#### Approach 4: Manual documented process (no script)

Document a step-by-step runbook for support/DEV to execute manually via Supabase Studio SQL editor + Auth dashboard.

- **Effort**: Low
- **Pros**: Zero code; no maintenance burden; no dependency on env vars or service role keys
- **Cons**: Error-prone (manual steps can be skipped or misordered); no atomicity guarantee; time-consuming; no audit of what happened; the issue specifically asks for a "script/CLI o proceso manual documentado" — this would only satisfy the latter half

### Recommendation

**Approach 2 (TypeScript script with supabase-js Admin client)** — the clear winner for this use case:

1. **Auth user creation is an API call**, not a DB operation. A TypeScript script using supabase-js Admin client (`admin.auth.admin.createUser()`) is the idiomatic way to create users with `app_metadata.tenant_id`.
2. **Compensation is possible**: track created resources (tenant UUID, auth user ID) in memory and roll back with `admin.auth.admin.deleteUser()` + `admin.from().delete()` if any step fails.
3. **Validation libraries exist**: `Intl.supportedValuesOf('timeZone')` for IANA timezone validation, a curated ISO 4217 list for currency validation, and simple regex for slug generation (kebab-case from name).
4. **Matches project patterns**: The repo already uses TypeScript, pnpm, and supabase-js (via Next.js). A `packages/cli` or `supabase/scripts/` package fits naturally.

Key design decisions to make in proposal:
- **Where to place the script**: `supabase/scripts/create-tenant-with-admin.ts` (simple) vs `packages/cli/` (extensible for future scripts)
- **Env vars**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already conventional in the Supabase ecosystem)
- **Compensation model**: Sequential (try/rollback each step) vs implicit (single DB transaction + Auth compensation)
- **Execution**: via `pnpm tsx supabase/scripts/create-tenant-with-admin.ts` or install as a workspace script

### Risks

1. **Service role key exposure**: The script needs `SERVICE_ROLE_KEY` to create Auth users and bypass RLS. Must be documented as sensitive — never committed, never in CI logs, use `.env.local` or prompting.
2. **No existing `packages/cli` or script pattern**: This will be the first script/CLI in the repo, so there's no established pattern to follow. All patterns must be created from scratch.
3. **Password mutation risk**: The script receives a manual temporary password. If the Auth API rejects the password (too weak, not complex enough), the script must fail clearly. Supabase enforces minimum password strength server-side.
4. **Idempotency**: No idempotency key pattern exists yet. If the script is re-run for the same tenant slug after an Auth failure on the first run, it could create a partial tenant. The compensation model must handle this.
5. **Supabase Command Gate**: The Supabase CLI cannot be used. Script must use the REST API (via supabase-js or fetch) for Auth operations.
6. **Password policy**: Supabase defaults to minimum 6 characters. If the client enforces a stricter rule, it will fail server-side. The script should validate minimum length before calling the API.

### Ready for Proposal

**Yes** — the exploration is complete. Key items for the orchestrator to clarify before proposal:

1. **Script location**: `supabase/scripts/create-tenant-with-admin.ts` (simple, colocated with infra) or `packages/cli/` (extensible, but introduces a new workspace package)?
2. **Role names**: In English (`admin`, `supervisor`, `operator`, `maintenance`, `fuel_dispenser`) or Spanish (`administrador`, `supervisor`, `operador`, `mantenimiento`, `repartidor_de_combustible`)? The existing model uses `is_web_access`, `is_system` (English) but the vault docs use Spanish role names.
3. **Capability seed**: Should the script also create the capability catalog entries (17 MVP capabilities from the vault) if they don't exist, or assume they're already seeded via a separate migration? Currently they don't exist in the DB.
4. **Default capability-to-role mapping**: The vault doesn't fully specify which capabilities each of the 5 roles gets. This needs to be defined in the proposal/spec phase.
5. **Supabase Auth user**: Should `email_confirmations` stay disabled (existing config), or should the script handle confirmation tokens?
