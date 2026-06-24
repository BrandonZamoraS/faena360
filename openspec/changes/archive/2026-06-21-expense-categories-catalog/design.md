# Design: expense-categories-catalog

## Decision Summary

Implement the tenant expense category catalog at `/dashboard/categorias_gastos`, backed by a new `categorias_gastos` table and capability-gated Server Actions. Keep authorization based on effective capabilities (`categories:read`, `categories:create`, `categories:update`) and never roles.

| Tension | Decision | Rationale |
| --- | --- | --- |
| Route compatibility | Replace the dashboard registry entry for `categories` with `/dashboard/categorias_gastos`. Do not keep `/dashboard/categories` as a second public route in this change. | Issue #44 established a placeholder pattern; issue #47 is the concrete module contract. A silent alias would create two URLs to maintain before any external dependency is proven. |
| DB uniqueness | Use partial uniqueness for active categories: unique normalized `nombre` per `tenant_id` where `estado = 'activo'`. | Matches hide-not-delete behavior and allows recreating a visible name after the old row is hidden. The vault's strict `unique(tenant_id, nombre)` would prevent reuse forever; if product wants that, this design must be revised before apply. |
| Supabase tests | Add SQL tests later, but do not run Supabase CLI without explicit user authorization. | Project gate forbids default Supabase execution. Design can define required tests; apply/verify must ask before `supabase db reset`, `supabase test`, or psql execution. |

## Implementation Shape

### Database

Add a migration such as `supabase/migrations/<timestamp>_create_categorias_gastos.sql`:

- Table columns: `id uuid primary key default gen_random_uuid()`, `tenant_id uuid not null references tenants(id) on delete restrict`, `nombre text not null`, `descripcion text`, `estado text not null default 'activo' check (estado in ('activo','oculto'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Normalize `nombre` with a BEFORE INSERT/UPDATE trigger that trims whitespace; reject empty names with a check.
- Add `nombre_normalizado` as generated `lower(nombre)` or an expression index if generated columns are not preferred.
- Add `unique (tenant_id, nombre_normalizado) where estado = 'activo'`.
- Add `set_updated_at` trigger and attach `audit_trigger()` for insert/update; no delete policy.
- Enable RLS with authenticated policies scoped by `tenant_id = current_app_tenant_id()` for select/insert/update and an explicit delete-deny policy.

### Application/Web

Prefer a small service/repository pair instead of embedding mutation rules only in React:

- `packages/domain/src/expense-categories.ts`: `ExpenseCategory`, inputs, repository port, result codes.
- `packages/application/src/expense-categories/catalog.ts`: list/create/update/hide methods; normalize `nombre`, reject empty, require the matching capability, use session tenant only.
- `packages/infrastructure/src/expense-categories/SupabaseExpenseCategoryRepository.ts`: queries `categorias_gastos` with `.eq('tenant_id', tenantId)` and `.eq('estado','activo')`; maps duplicate constraint to stable duplicate-name result.
- Export from package `index.ts` files.

Create `apps/web/app/dashboard/categorias_gastos/page.tsx` following the `admin_usuarios` pattern: `requireWebAccess` with server-state session refresh, page gate for `categories:read`, render read-only list for read-only users, show create controls only with `categories:create`, and edit/hide controls only with `categories:update`. Server Actions must repeat action-level checks, ignore any form tenant, call the service, and `revalidatePath('/dashboard/categorias_gastos')`.

Update `apps/web/app/dashboard/page.tsx` registry entry: `slug: 'categorias_gastos'`, `href: '/dashboard/categorias_gastos'`, label `Categorías de gastos`, still visible via `categories:read`.

## Verification Plan

- `apps/web/app/dashboard/page.runtime.test.tsx`: assert dashboard link changes from `/dashboard/categories` to `/dashboard/categorias_gastos`.
- `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`: page gate, read-only supervisor rendering, admin create/edit/hide controls, direct action denial without mutation capability, tenant from session.
- Application tests for empty name, duplicate result, tenant spoof rejection, capability denial.
- `supabase/tests/expense_categories_catalog.sql`: RLS tenant isolation, no delete, active-only uniqueness, hidden-name reuse, required name, active-only normal query.

## Open Risk

Partial uniqueness intentionally diverges from the vault DB note that says `unique(tenant_id, nombre)`. This is acceptable only because the molecular spec allowed “uniqueness among non-hidden records or defined constraint”; product owner should approve before apply if strict historical name blocking is desired.
