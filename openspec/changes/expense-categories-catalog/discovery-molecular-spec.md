# Discovery + Molecular Spec: expense-categories-catalog

## Executive Summary

Implement the tenant-scoped expense category catalog end-to-end, without implementing operational expenses themselves. The catalog MUST let authorized users list, create, edit, and hide expense categories for their own tenant; normal views MUST exclude hidden categories; authorization MUST use effective capabilities (`categories:read`, `categories:create`, `categories:update`) and never hardcoded roles.

## Discovery

### Source-of-Truth Product Rules

| Area | Finding |
| --- | --- |
| Expense category requirement | Every expense requires a category, and expense categories MUST be defined/administered from the web platform. WhatsApp users may only select preconfigured categories; they cannot create new categories. |
| Tenant ownership | Each company/tenant configures its own expense categories; data MUST NOT be shared across tenants. |
| Authorization | Roles are templates only. Web access and actions MUST be resolved from tenant-scoped effective capabilities. Missing capability means deny by default. |
| Supervisor default | Supervisor has web access and broad read visibility, but must not administer categories unless explicitly granted additional capabilities. |
| Hiding/deletion | Platform flows MUST NOT physically delete records. Used expense categories can be hidden and retained for audit. Hidden records MUST NOT appear in normal views. |
| Backend/DB validation | Critical rules MUST be validated beyond UI: tenant separation, effective permissions/capabilities, RLS, auditability, and soft-delete consistency. |

Fuentes vault: `obsidian-vault/estructura-vault.md`, `obsidian-vault/01-producto/enunciado-sistema/00-indice-enunciado.md`, `obsidian-vault/01-producto/enunciado-sistema/03-enunciado-parte-3.md`, `obsidian-vault/01-producto/enunciado-sistema/09-enunciado-parte-9.md`, `obsidian-vault/01-producto/enunciado-sistema/10-enunciado-parte-10.md`, `obsidian-vault/01-producto/enunciado-sistema/12-enunciado-parte-12.md`, `obsidian-vault/03-modulos/03-modulos.md`, `obsidian-vault/03-modulos/gastos-ingresos/index.md`, `obsidian-vault/03-modulos/gastos-ingresos/categorias.md`, `obsidian-vault/07-database/07-database.md`, `obsidian-vault/07-database/modelo-datos.md`, `obsidian-vault/07-database/reglas-integridad.md`.

### Current Technical State

- Issue #44 catalog patterns are present in `openspec/changes/issue-44-catalog-patterns/`.
- The dashboard shell already gates `/dashboard` with refreshed app session, `can_access_web`, and `web.portal.access`.
- Dashboard navigation is capability-driven and currently exposes a generic categories module at `/dashboard/categories` for `categories:read`.
- Default capability catalog already includes `categories:read`, `categories:create`, and `categories:update`; do not introduce `catalog.*` keys.
- Default role bootstrap grants administrator `categories:*` and supervisor only `categories:read`, matching the requested read-only supervisor behavior.
- No `categorias_gastos` application route/table/migration exists yet in the inspected files.
- Existing SQL test files live under `supabase/tests/`; Supabase CLI execution is gated and must be explicitly authorized later.

Inspected code/artifacts: `openspec/changes/issue-44-catalog-patterns/discovery-molecular-spec.md`, `openspec/changes/issue-44-catalog-patterns/design.md`, `openspec/specs/effective-capabilities/spec.md`, `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/admin_usuarios/page.tsx`, `apps/web/lib/auth/session.ts`, `packages/domain/src/auth/capabilities.ts`, `supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql`, `supabase/scripts/default-role-bootstrap.ts`, `apps/web/app/dashboard/page.runtime.test.tsx`.

## Intended Behavior

### Catalog Data

The system MUST create and operate a tenant-scoped `categorias_gastos` table with:

| Column | Rule |
| --- | --- |
| `id` | UUID primary key. |
| `tenant_id` | Required tenant FK; all reads/writes and RLS policies scope by this value. |
| `nombre` | Required, non-empty category name. Unique per tenant among visible/active records. |
| `descripcion` | Optional text description. |
| `estado` | Canonical values: `activo`, `oculto`. Normal views show only `activo`. |
| `created_at` | UTC timestamp. |
| `updated_at` | UTC timestamp. |

Uniqueness SHOULD use a partial unique constraint on normalized name for active/not-hidden records if the implementation allows reusing a name after hiding. If the implementation chooses strict `unique(tenant_id, nombre)` instead, design MUST call out that hidden names cannot be reused.

### UI

- Route: `/dashboard/categorias_gastos`.
- Users with `categories:read` MUST be able to view active categories for their tenant.
- Users with `categories:create` MUST see and execute creation controls.
- Users with `categories:update` MUST see and execute edit/hide controls.
- Users with only `categories:read` MUST see read-only content and no mutation controls.
- The page MUST repeat server-side page-level capability checks before loading category data.
- Server Actions MUST repeat action-level effective capability checks before mutating data.
- Form/request data MUST NOT be trusted for `tenant_id`; tenant scope comes from the refreshed server session.

### Hide Instead of Delete

- Hide action MUST set `estado = 'oculto'`; it MUST NOT physically delete the category.
- Normal category lists and selectors MUST exclude `estado = 'oculto'`.
- Hidden categories MUST remain persisted for audit/support and for historical expense references.

### Out of Scope

- Creating operational expenses.
- Associating expenses with machines, projects, subprojects, acarreos, or operational financial logic.
- WhatsApp/n8n category creation.
- Custom category hierarchy, default seed list, restoration of hidden categories from the platform, or physical delete.
- New capability namespace such as `catalog.*`.

## Affected Capability / Domain

- Capability domain: existing effective capabilities `categories:read`, `categories:create`, `categories:update`, plus `web.portal.access` for dashboard access.
- Database domain: tenant-scoped `categorias_gastos` schema, RLS, indexes/constraints, and SQL tests.
- Web domain: dashboard navigation and `/dashboard/categorias_gastos` route with Server Actions.
- Application/infrastructure domain: category catalog service/repository only if needed to keep mutation rules testable outside React.

## Acceptance Scenarios

### Scenario: Admin creates a category

- GIVEN an active tenant user with `web.portal.access`, `categories:read`, and `categories:create`
- WHEN they submit `nombre = "Combustible"` and optional `descripcion`
- THEN a `categorias_gastos` row is created with the session `tenant_id`
- AND `estado = 'activo'`
- AND the category appears in that tenant's normal list.

### Scenario: Name is required

- GIVEN a user with `categories:create`
- WHEN they submit an empty or whitespace-only `nombre`
- THEN the system rejects the operation with a stable validation error
- AND no category row is inserted.

### Scenario: Name uniqueness is tenant-scoped

- GIVEN tenant A already has active category `Combustible`
- WHEN tenant A creates another active category with the same normalized name
- THEN the system rejects it
- BUT another tenant may create its own active `Combustible` category.

### Scenario: Edit category

- GIVEN a user with `categories:update`
- WHEN they edit an existing active category in their tenant
- THEN only fields allowed by the catalog contract are updated
- AND `updated_at` changes
- AND categories from other tenants remain inaccessible.

### Scenario: Hide category

- GIVEN a user with `categories:update`
- WHEN they hide a category
- THEN the row remains in `categorias_gastos`
- AND `estado` becomes `oculto`
- AND normal list queries no longer return it.

### Scenario: Supervisor remains read-only by default

- GIVEN the default supervisor effective capabilities include `categories:read` but not `categories:create` or `categories:update`
- WHEN the supervisor opens `/dashboard/categorias_gastos`
- THEN they can view active categories
- AND create/edit/hide controls are not rendered
- AND direct Server Action invocation for create/edit/hide is denied.

### Scenario: Missing read capability denies page access

- GIVEN a web session without `categories:read`
- WHEN the user opens `/dashboard/categorias_gastos`
- THEN the page redirects or denies access before category data is loaded.

### Scenario: RLS enforces tenant isolation

- GIVEN authenticated sessions for tenant A and tenant B
- WHEN tenant A queries or mutates `categorias_gastos`
- THEN only tenant A rows are visible/mutable
- AND tenant B rows cannot be selected, updated, or hidden.

## Minimal Affected Code Areas for Design/Apply

| Area | Expected work |
| --- | --- |
| `supabase/migrations/*.sql` | Add `categorias_gastos`, constraints/indexes, timestamps, RLS policies, and possibly audit trigger coverage. |
| `supabase/tests/*.sql` | Add SQL tests for tenant isolation, required/unique names, and hidden-state filtering/constraints. |
| `supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql` | Likely no new keys; verify `categories:*` remains sufficient. |
| `supabase/scripts/default-role-bootstrap.ts` | Likely no change; verify admin/write vs supervisor/read-only behavior remains aligned. |
| `apps/web/app/dashboard/page.tsx` | Update dashboard navigation from generic `/dashboard/categories` to `/dashboard/categorias_gastos` or provide a deliberate compatibility decision. |
| `apps/web/app/dashboard/categorias_gastos/page.tsx` | New page, read gate, read-only rendering, forms/actions for create/edit/hide. |
| `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx` | Runtime tests for admin actions, supervisor read-only, missing capability, and action denial. |
| `packages/application/src/**` and `packages/infrastructure/src/**` | Optional category catalog service/repository if keeping validation/authorization out of page-only code improves testability. |

## Risks / Questions

- Route convention conflict: issue #44 used `/dashboard/categories` as a generic example, while issue #47 explicitly requests `/dashboard/categorias_gastos`. This spec follows issue #47, but design should decide whether to replace the existing dashboard link or add a redirect/alias.
- Database docs currently mention `unique(tenant_id, nombre)`, while issue #47 allows uniqueness “among not hidden or defined constraint.” Design must choose strict uniqueness vs partial uniqueness and document the tradeoff.
- The vault lists pending items for default categories, hierarchy, and additional fields. These are not blockers because issue #47 defines the needed fields and excludes extra category modeling; do not invent defaults/hierarchy.
- Supabase SQL verification is requested by the issue, but running Supabase CLI commands requires explicit user authorization in later phases.
