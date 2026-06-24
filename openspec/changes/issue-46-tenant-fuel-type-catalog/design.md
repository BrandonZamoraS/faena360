# Design: Tenant Fuel Type Catalog

## Technical Approach

Implement `tipos_combustible` as a small tenant-scoped catalog following the existing `clientes` database pattern and `admin_usuarios` App Router/server-action pattern. The page lives at `/dashboard/tipos_combustible`, lists only `estado = 'activo'`, and repeats authorization in both page load and Server Actions. Tenant scope always comes from the refreshed server session.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Route | Use `/dashboard/tipos_combustible`; replace dashboard link from `/dashboard/fuel_types` | Keep English route or add alias | Issue #46 and molecular spec explicitly require Spanish route. Adding an alias increases surface area without product need. |
| Catalog layer | Keep implementation page-local for this MVP | Add domain/application/infrastructure ports | Existing catalog pages are not present yet; user admin is richer because it coordinates Auth. Fuel types are CRUD-only against one table, so page-local helpers keep scope reviewable. Extract later when a second catalog repeats the pattern. |
| Name uniqueness | Unique per tenant among active rows using normalized name: `unique (tenant_id, lower(trim(nombre))) where estado = 'activo'` | Strict tenant lifetime uniqueness including hidden rows | Practical catalog behavior allows recreating a name after hide while blocking duplicate active choices. Tradeoff: historical hidden duplicates can exist, so future references should use `id`, never `nombre`. |
| Soft delete | Hide via `estado = 'oculto'`; no DELETE for authenticated users | Physical delete | Matches spec and `clientes` pattern. |

## Data Flow

```text
Request /dashboard/tipos_combustible
  -> requireWebAccess + refreshed AppSession
  -> require fuel_types:read
  -> service-role Supabase query scoped by session.tenant_id and estado='activo'
  -> render read-only or mutation controls based on capabilities

Create/Edit/Hide form
  -> Server Action
  -> refreshed AppSession
  -> require fuel_types:create or fuel_types:update
  -> validate nombre/id
  -> scoped Supabase insert/update using session.tenant_id
  -> revalidatePath('/dashboard/tipos_combustible')
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_create_tipos_combustible.sql` | Create | Table, checks, indexes, partial unique active-name index, updated_at trigger, RLS, DELETE deny, optional audit trigger. |
| `supabase/tests/tipos_combustible_catalog.sql` | Create | SQL verification for tenant isolation, blank name, active uniqueness, hide behavior, delete denial. Do not execute without approval. |
| `apps/web/app/dashboard/page.tsx` | Modify | Change fuel module href to `/dashboard/tipos_combustible`. |
| `apps/web/app/dashboard/page.runtime.test.tsx` | Modify | Update expected fuel link. |
| `apps/web/app/dashboard/tipos_combustible/page.tsx` | Create | Server page, view model, shell, list/create/update/hide actions. |
| `apps/web/app/dashboard/tipos_combustible/page.runtime.test.tsx` | Create | Render and capability-gate tests. |

## Interfaces / Contracts

Database:
- `tipos_combustible(id uuid pk, tenant_id uuid not null, nombre text not null check length(trim(nombre)) > 0, estado text not null default 'activo' check in ('activo','oculto'), created_at timestamptz, updated_at timestamptz)`.
- Indexes: `(tenant_id)`, `(tenant_id, estado)`, partial unique on `(tenant_id, lower(trim(nombre))) where estado = 'activo'`.
- RLS: authenticated SELECT/INSERT/UPDATE scoped by `current_app_tenant_id()`, DELETE `using(false)`.

View model:
- `FuelTypeSummary = { id: string; nombre: string; estado: 'activo' }`.
- Stable action errors: `missing_name`, `duplicate_active_name`, `missing_fuel_type`, `capability_denied`, `mutation_failed`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Runtime unit | Page shell hides create/edit/hide for read-only supervisor; action gates require capabilities | Vitest render/static helper tests. |
| SQL | RLS isolation, required name, uniqueness, hide, delete denial | `supabase/tests/tipos_combustible_catalog.sql`; report command only unless authorized. |
| Quality | Type/lint/build | `pnpm -r typecheck`, `pnpm lint`, `pnpm build` when apply/verify runs. |

## Migration / Rollout

Apply after current migrations. No backfill is required because this is a new catalog. Rollback is dropping the table, policies, triggers, indexes, and tests before production data exists; after production use, prefer disabling route access over destructive rollback.

## Open Questions

- [ ] Should audit use the generic `audit_trigger()` or a catalog-specific trigger like `clientes`? Recommended: generic if compatible; otherwise mirror `clientes`.
- [ ] Should hidden fuel types ever be restorable, or only recreated as new active rows?
- [ ] Should a temporary redirect from `/dashboard/fuel_types` be added for users who already saw issue #44 links? Recommended: no unless released externally.

## Review Slicing Recommendation

Use chained PRs: (1) migration + SQL test, (2) dashboard route link, (3) fuel type page/actions/runtime tests. This keeps the 400-line review budget realistic.
