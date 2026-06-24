# Molecular Spec: issue-46-tenant-fuel-type-catalog

## Intended behavior
Implement a tenant-scoped fuel type catalog end-to-end.

- Route: `/dashboard/tipos_combustible`.
- Table: `tipos_combustible`.
- Required fields:
  - `id`
  - `tenant_id`
  - `nombre`
  - `estado`
  - `created_at`
  - `updated_at`
- `nombre` is required and non-empty.
- `estado` supports `activo` and `oculto`.
- Normal views list only active/not-hidden records.
- Hide action sets `estado = 'oculto'`; no physical delete.
- Tenant scope always comes from the refreshed server session, never form/search params.
- Tenant A must never see or mutate Tenant B fuel types.
- Fuel type catalog is only configuration/catalog scope; operational fuel inventory, machines, purchases, loads, costs, and consumption are out of scope except future read contracts.

## Capability/domain affected
- Capability domain:
  - `fuel_types:read`
  - `fuel_types:create`
  - `fuel_types:update`
  - `web.portal.access`
- Database domain:
  - new `tipos_combustible` table
  - tenant RLS
  - constraints/indexes for required name, state, tenant isolation, uniqueness
- Web domain:
  - dashboard route `/dashboard/tipos_combustible`
  - list/create/edit/hide UI
  - supervisor read-only rendering
  - Server Actions repeating authorization

## Acceptance scenarios
1. **Admin creates fuel type**
   - GIVEN active tenant user with `web.portal.access`, `fuel_types:read`, `fuel_types:create`
   - WHEN submitting `nombre = "Diésel"`
   - THEN row is created for session `tenant_id`
   - AND `estado = 'activo'`
   - AND it appears in normal list.

2. **Name is required**
   - GIVEN user with `fuel_types:create`
   - WHEN `nombre` is empty/whitespace
   - THEN operation is rejected with stable validation error
   - AND no row is inserted.

3. **Name uniqueness is tenant-scoped**
   - GIVEN Tenant A has active `Diésel`
   - WHEN Tenant A creates another active `Diésel`
   - THEN operation is rejected
   - BUT Tenant B may create its own active `Diésel`.

4. **Edit fuel type**
   - GIVEN user with `fuel_types:update`
   - WHEN editing active fuel type in their tenant
   - THEN only allowed fields update
   - AND `updated_at` changes
   - AND other tenant rows remain inaccessible.

5. **Hide fuel type**
   - GIVEN user with `fuel_types:update`
   - WHEN hiding fuel type
   - THEN row remains persisted
   - AND `estado = 'oculto'`
   - AND normal list excludes it.

6. **Supervisor read-only**
   - GIVEN default supervisor has `fuel_types:read` but not create/update
   - WHEN opening `/dashboard/tipos_combustible`
   - THEN they can view active fuel types
   - AND no create/edit/hide controls render
   - AND direct mutation invocation is denied.

7. **Missing read capability denies page**
   - GIVEN web session without `fuel_types:read`
   - WHEN opening route
   - THEN access redirects/denies before loading data.

8. **RLS tenant isolation**
   - GIVEN authenticated sessions for tenants A and B
   - WHEN Tenant A queries/updates/hides fuel types
   - THEN only Tenant A rows are visible/mutable.

## Source-of-truth notes consulted
- `H:\Mi unidad\Faena360\estructura-vault.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\00-indice-enunciado.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\06-enunciado-parte-6.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\09-enunciado-parte-9.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\10-enunciado-parte-10.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\12-enunciado-parte-12.md`

## Minimal affected code areas
- `supabase/migrations/*.sql`
- `supabase/tests/*.sql`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/dashboard/tipos_combustible/page.tsx`
- `apps/web/app/dashboard/tipos_combustible/page.runtime.test.tsx`
- Optional if needed:
  - `packages/application/src/**`
  - `packages/infrastructure/src/**`

## Risks/questions
- Route mismatch: issue #44 dashboard currently links fuel types at `/dashboard/fuel_types`; issue #46 requests `/dashboard/tipos_combustible`. Design should decide whether to replace the link or provide an alias/redirect.
- Uniqueness must be explicitly chosen: partial unique among non-hidden normalized names allows reuse after hide; strict unique prevents reuse forever.
- Supabase SQL tests are requested, but execution is gated and must not run without explicit authorization.
- Current actual frontend app is under `apps/web/`; `faena_frontend/` exists but targeted app code inspected is `apps/web/`.

## Review workload forecast
Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: Medium/High

Reason: database migration + RLS + SQL tests + route/UI + runtime tests may exceed 400 changed lines if delivered as one PR.
