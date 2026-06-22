# Discovery + Molecular Spec: Tenant Project Catalog

## Source

- GitHub issue: `#49 feat(projects): implement tenant project catalog`
- Dependencies verified by orchestrator: `#44` and `#45` are closed/completed.
- Product source of truth verified against the relevant enunciado parts: 02, 09, 10, 11, and 12.

## Intended Behavior

- Add tenant-scoped project catalog at `/dashboard/proyectos`.
- List only projects where `estado != 'oculto'` in normal views.
- Create/edit project with required `nombre`, `cliente_id`, `ubicacion`, `fecha_inicio`, and `forma_cobro`.
- `nombre` must be unique per tenant among non-hidden projects.
- `cliente_id` must reference an active/non-hidden client from the same tenant.
- `forma_cobro` values: `monto_fijo`, `por_horas`, `por_dia`.
- `monto_fijo` is required when `forma_cobro = 'monto_fijo'`; hourly/daily modes should not require it.
- Lifecycle states: `activo`, `pausado`, `finalizado`, `oculto`.
- State transitions:
  - create -> `activo`
  - reopen finalized project -> `activo` or `pausado`
  - pause -> `pausado`
  - finish -> `finalizado`
  - hide -> `oculto`
- No physical delete from platform flows.
- Paused and finalized projects block new associated records until reopened.
- Before pausing or finalizing, the system must validate open jornadas associated with the project or its subprojects.
- Pausing/finalizing with open jornadas must be blocked unless an administrative forced action is explicitly supported; forced action requires confirmation, mandatory reason, and invalidates/annuls affected jornadas without counting them in operational or financial totals.
- Finalizing a project must ask for confirmation because it also finalizes its subprojects when subprojects exist.

## Capabilities

- `projects:read`: list/view projects.
- `projects:create`: create projects.
- `projects:update`: edit project core fields.
- `projects:pause`: pause projects.
- `projects:finish`: finish projects.
- `projects:reopen`: reopen projects.
- `projects:hide`: hide projects via soft delete.

## Data Requirements

Create `proyectos` with at least:

- `id`
- `tenant_id`
- `nombre`
- `cliente_id`
- `ubicacion`
- `fecha_inicio`
- `fecha_finalizacion`
- `forma_cobro`
- `monto_fijo`
- `estado`
- `created_at`
- `updated_at`

Database rules:

- RLS isolates by `tenant_id`.
- `cliente_id` must belong to the same tenant as the project.
- Required text fields must reject blank values where applicable.
- Normal read helpers filter out `estado = 'oculto'`.

## UI Requirements

- Route: `/dashboard/proyectos`.
- Dashboard module registry should use Spanish route `/dashboard/proyectos`, not `/dashboard/projects`.
- Show project list with non-hidden projects.
- Provide create/edit form.
- Client selector lists active/non-hidden clients for the current tenant.
- Client selector and names require `clients:read`.
- Show actions according to effective capabilities, not hardcoded roles.
- Supervisor/read-only users see the list but no create/edit/lifecycle actions.

## Acceptance Scenarios

- Admin creates a project with an active same-tenant client.
- Creating without client fails.
- Creating with a client from another tenant fails.
- Creating without `ubicacion` fails.
- Creating a non-hidden project with a duplicate tenant/name fails.
- Admin edits project fields with `projects:update`.
- Admin pauses, finalizes, reopens, and hides a project with the matching lifecycle capability.
- Pausing/finalizing a project with open jornadas is rejected unless an explicit administrative forced flow is implemented with mandatory reason.
- A finalized project can be reopened to `activo` or `pausado`.
- Hidden projects disappear from normal lists.
- Supervisor with read-only permissions sees projects but no write/lifecycle actions.
- Direct mutation without the required capability is rejected.

## Test Expectations

- SQL: tenant isolation.
- SQL: project requires same-tenant client.
- SQL: `ubicacion` required.
- SQL/Application: project name unique per tenant among non-hidden projects.
- Application: create requires `projects:create`.
- Application: edit requires `projects:update`.
- Application: pause requires `projects:pause`.
- Application: finish requires `projects:finish`.
- Application: reopen requires `projects:reopen`.
- Application: hide requires `projects:hide`.
- Application/SQL: fixed-amount projects require `monto_fijo`.
- Application/SQL: paused/finalized projects block new associated records.
- Runtime UI: admin sees actions according to capabilities.
- Runtime UI: supervisor/read-only sees no actions.

## Implementation Pattern Notes

- Mirror completed client catalog patterns from issue `#45`.
- Use effective capability checks in pages and mutations.
- Prefer service-role RPC/domain service pattern with actor/audit context where existing clients implementation established it.
- Keep tenant filtering in repositories and database policies; do not rely only on UI filtering.

## Risks / Questions

- Subproject cascading behavior may affect implementation if subprojects already exist or are introduced in the same delivery slice.
- Review workload is likely over 400 changed lines if DB, domain, app tests, UI, and runtime tests are done in one PR.
- Recommended split: first DB + domain/application/infrastructure, then web UI/runtime tests.

## Review Workload Forecast

- Estimated size: high.
- 400-line budget risk: high.
- Chained PRs recommended: yes, unless owner approves a size exception.
