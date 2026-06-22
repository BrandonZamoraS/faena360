# Design: Tenant Project Catalog

## Technical Approach

Implement `proyectos` at `/dashboard/proyectos` using the completed `clientes` pattern: domain contracts, application service, Supabase infrastructure repository, service-role RPC mutations, and a Next.js dashboard page with repeated server-side capability gates. Normal reads return `estado != 'oculto'`; lifecycle changes are explicit actions.

## Architecture Decisions

| Topic | Choice | Rationale |
|---|---|---|
| Route | Change dashboard module href from `/dashboard/projects` to `/dashboard/proyectos`. | Current catalog routes are Spanish (`clientes`, `categorias_gastos`, `tipos_combustible`). |
| Layers | Add `projects` modules under domain/application/infrastructure. | Project lifecycle/client validation is closer to `clientes` than page-local CRUD. |
| Mutations | Use RPCs: `create/update/pause/finish/reopen/hide_proyecto`. | Centralizes tenant checks, capability checks, audit context, and transition rules; direct authenticated INSERT/UPDATE/DELETE stay denied. |
| Open jornadas | Include administrative forced pause/finalize flow with explicit confirmation, mandatory reason, and invalidation/annulment of affected open jornadas so they do not count in operational or financial totals. | Owner explicitly included the forced flow after enunciado verification. |
| `projects:hide` | Add/verify seed for `projects:hide` before wiring hide. | The molecular spec requires it, but current seed only shows read/create/update/pause/finish/reopen. |
| Project name uniqueness | Enforce unique project names per tenant among non-hidden projects. | Owner decision; prevents duplicate active catalog records while allowing hidden historical names. |
| Client selector visibility | Require `clients:read` to display and select client names in the project form. | Owner decision; client names remain permission-gated. |

## Data Model / Migration Strategy

Create `supabase/migrations/*_create_proyectos.sql` with:

- `id`, `tenant_id`, `nombre`, `cliente_id`, `ubicacion`, `fecha_inicio`, `fecha_finalizacion`, `forma_cobro`, `monto_fijo`, `estado`, `created_at`, `updated_at`.
- Checks: trimmed required text, `forma_cobro in ('monto_fijo','por_horas','por_dia')`, `monto_fijo > 0` required only for `monto_fijo`, states in `activo|pausado|finalizado|oculto`, unique project names per tenant among non-hidden projects.
- FK: `cliente_id -> clientes(id)` plus RPC validation that client is same-tenant and `estado='activo'`.
- Indexes: `(tenant_id, estado)`, `(tenant_id, cliente_id)`.
- RLS: SELECT scoped by `current_app_tenant_id()` and `projects:read`; direct INSERT/UPDATE/DELETE denied; RPC execute only for `service_role`.
- Audit: prefer generic `audit_trigger()` if compatible; otherwise mirror `audit_clientes_trigger()` and exclude timestamp-only diffs.

## Data Flow

```text
/dashboard/proyectos -> requireWebAccess -> projects:read
  -> ProjectCatalogService.listVisibleProjects(session)
  -> repository.listVisible({ tenantId })
  -> proyectos where tenant_id=session.tenant_id and estado!='oculto'

Server Action -> refreshed AppSession -> action capability gate
  -> application validation -> service-role RPC(actor, tenant, audit)
  -> DB tenant/client/lifecycle/open-jornada checks
  -> revalidatePath('/dashboard/proyectos')
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_create_proyectos.sql` | Create | Table, checks, RLS, RPCs, audit, `projects:hide` seed if absent. |
| `supabase/tests/proyectos_catalog.sql` | Create | SQL validation for isolation, client tenant, fixed amount, direct mutation denial, lifecycle rules. |
| `packages/domain/src/projects/*` | Create | DTOs, state/billing types, repository port, error codes. |
| `packages/application/src/projects/*` | Create | Capability gates, normalization, transition validation, tests. |
| `packages/infrastructure/src/projects/*` | Create | Supabase list filters and RPC mapping, tests. |
| `apps/web/app/dashboard/_lib/dashboard-modules.ts` | Modify | Spanish project route. |
| `apps/web/app/dashboard/proyectos/page.tsx` | Create | Page shell, forms, active-client selector, lifecycle buttons. |
| `apps/web/app/dashboard/proyectos/page.runtime.test.tsx` | Create | Read-only/admin UI and action-gate coverage. |

## Interfaces / Contracts

Types: `ProjectEstado = 'activo'|'pausado'|'finalizado'|'oculto'`; `FormaCobro = 'monto_fijo'|'por_horas'|'por_dia'`.

Stable service errors: `missing_nombre`, `duplicate_nombre`, `missing_cliente`, `inactive_cliente`, `missing_ubicacion`, `missing_fecha_inicio`, `invalid_forma_cobro`, `missing_monto_fijo`, `capability_denied`, `invalid_transition`, `open_jornadas_blocking`, `missing_forced_reason`, `project_create_failed`, `project_update_failed`.

Client selector: list active same-tenant clients only when the session has `clients:read`.

## Testing / Verification Plan

| Layer | What | Approach |
|---|---|---|
| SQL | RLS, same-tenant active client, required fields, fixed amount, unique non-hidden names, lifecycle RPCs, forced reason validation, `projects:hide`. | `supabase/tests/proyectos_catalog.sql`; do not run reset without approval. |
| Application | `projects:*` capability denial, tenant override rejection, lifecycle errors. | Vitest fake repository/checker like clients. |
| Infrastructure | RPC names/args and visible-list filters. | Mock Supabase tests like clients. |
| Runtime UI | Supervisor read-only, admin controls, active sidebar. | `renderToStaticMarkup` tests. |

## Rollout / PR Slicing

Use chained PRs: (1) DB/RPC/SQL tests, (2) domain/application/infrastructure, (3) dashboard route/page/runtime tests. One PR likely exceeds 400 review lines.

## Open Questions

- [x] Owner decision: include forced pause/finalize with open jornadas now.
- [x] Owner decision: project names are unique per tenant among non-hidden projects.
- [x] Owner decision: project form requires `clients:read` to populate client names.
