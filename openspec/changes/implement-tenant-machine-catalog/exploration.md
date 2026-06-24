## Molecular Spec: Tenant machine catalog

### Source Inputs
- Issue/request: present — GitHub #48 defines tenant-scoped machine catalog, permissions, tests, and out-of-scope boundaries.
- Primary docs: `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\00-indice-enunciado.md`, `04-enunciado-parte-4.md`, `06-enunciado-parte-6.md`, `09-enunciado-parte-9.md`, `10-enunciado-parte-10.md`, `11-enunciado-parte-11.md`, `12-enunciado-parte-12.md`, `03-modulos\maquinaria\index.md`, `entidad.md`, `combustible.md`, `estados.md`, `flujos.md`, `reglas-validacion.md`, `07-database\modelo-datos.md`, `reglas-integridad.md`, `migraciones.md`
- Targeted code checked: `apps/web/app/dashboard/_lib/dashboard-modules.ts`, `apps/web/app/dashboard/tipos_combustible/page.tsx`, `apps/web/app/dashboard/tipos_combustible/page.runtime.test.tsx`, `packages/application/src/fuel-types/fuel-type-catalog.ts`, `packages/domain/src/fuel-types/fuel-type-catalog.ts`, `packages/infrastructure/src/fuel-types/SupabaseFuelTypeCatalogRepository.ts`, `packages/application/src/projects/project-catalog.ts`, `packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.ts`, `supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql`, `supabase/migrations/20260618000000_create_tipos_combustible.sql`, `supabase/migrations/20260620000002_create_fuel_type_catalog_rpcs.sql`, `supabase/migrations/20260624000000_create_proyectos.sql`, `supabase/tests/tipos_combustible_catalog.sql`, `supabase/tests/tipos_combustible_rpcs.sql`, `supabase/scripts/default-role-bootstrap.ts`, `openspec/specs/effective-capabilities/spec.md`, `openspec/specs/authorization-base/spec.md`, `openspec/changes/issue-44-catalog-patterns/design.md`, `openspec/changes/issue-46-tenant-fuel-type-catalog/design.md`, `openspec/changes/issue-55-dashboard-sidebar-navigation/design.md`

### Intended Behavior
Admins and other authorized web users can list, create, edit, change status, and hide tenant machines from `/dashboard/maquinas`. Machine creation MUST enforce tenant-local `codigo`, tenant-local `tipo_combustible_id`, required fuel configuration, and machine type (`acarreo` or `por_tiempo`). Normal views MUST exclude `estado = 'oculta'`. Supervisors with only `machines:read` MUST see the catalog without mutation controls. Type changes MUST be blocked once the machine has associated operational records; if those records do not yet exist in the schema, the blocking test stays pending against the first dependent record set that enables it.

### Capability / Domain
Administrative catalog domain for `maquinas`, spanning tenant-scoped master data, effective-capability enforcement, soft-hide/status transitions, and downstream compatibility with fuel, assignments, jornadas, and maintenance.

### Acceptance Scenarios
- GIVEN an authenticated tenant user with `machines:create` WHEN they create a machine with a unique tenant code and an active tenant fuel type THEN the machine is persisted for that tenant and is visible in normal listings.
- GIVEN two tenants WHEN both use the same `codigo` THEN each tenant succeeds because uniqueness is tenant-local.
- GIVEN a machine payload that references another tenant's `tipo_combustible_id` WHEN persistence is attempted THEN backend/database validation rejects it.
- GIVEN a user with `machines:read` but without `machines:create`, `machines:update`, or `machines:change_status` WHEN they open `/dashboard/maquinas` THEN they can list machines but do not see create, edit, or status actions.
- GIVEN a machine with associated operational records WHEN an actor tries to change `tipo` THEN the mutation is rejected and the existing type remains unchanged.
- GIVEN a user with `machines:change_status` WHEN they change a machine to `oculta` THEN the row remains auditable but disappears from normal list/select views.

### Minimal Affected Areas
- `supabase/migrations/*create_maquinas*.sql` — create `maquinas`, tenant/FK/co-tenancy rules, RLS, and status mutation RPCs.
- `supabase/tests/maquinas_catalog.sql` and likely `supabase/tests/maquinas_rpcs.sql` — cover isolation, uniqueness, co-tenancy, and status/hide flows following fuel/project SQL patterns.
- `packages/domain/src/machines/*` — machine summary, inputs, outcomes, states, and repository contracts.
- `packages/application/src/machines/*` — tenant-scoped catalog service with capability gates for read/create/update/change_status.
- `packages/infrastructure/src/machines/*` — Supabase repository using list queries + machine RPCs.
- `apps/web/app/dashboard/maquinas/page.tsx` and `page.runtime.test.tsx` — server page, shell, form/actions, and runtime capability coverage.
- `apps/web/app/dashboard/_lib/dashboard-modules.ts` plus dashboard runtime expectations — replace the current placeholder `/dashboard/machines` link with the issue-defined `/dashboard/maquinas` route.

### Risks
- Vault DB docs lag the enunciado/issue: `07-database/modelo-datos.md` marks `tamanio_tanque` as optional and omits `nivel_inicial_combustible`, but issue #48 requires both machine fuel mode and initial level handling at create time.
- The current shared dashboard registry already advertises `machines:read` at `/dashboard/machines`; implementing `/dashboard/maquinas` without normalizing the registry will leave a dead or inconsistent nav contract.

### Owner Questions
- None

### Ready for Design
Yes — move to sdd-design with a likely HIGH 400-line budget risk. Chained PRs are recommended unless the implementation is sliced aggressively (for example: DB/RPC/tests first, then app+infra layer, then dashboard page/runtime tests).
