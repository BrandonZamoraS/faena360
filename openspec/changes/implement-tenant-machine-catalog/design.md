# Design: Tenant Machine Catalog

## Technical Approach

Implement `maquinas` as the next tenant catalog using the completed fuel-type/project patterns: database table + tenant-safe triggers/RLS, service-role RPCs for mutation, hexagonal domain/application/infrastructure packages, and an App Router page at `/dashboard/maquinas`. Normal reads list only non-`oculta` machines. Server session tenant/capabilities are authoritative; form input never accepts tenant overrides.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Route | Replace dashboard machine module href with `/dashboard/maquinas` while keeping slug `machines` | Keep `/dashboard/machines` or add alias | Issue #48 requires Spanish route; current `/dashboard/machines` is dead drift. Slug can stay capability-aligned. |
| DB mutation path | Use `SECURITY DEFINER` RPCs restricted to `service_role`: `create_maquina`, `update_maquina`, `change_maquina_status` | Direct authenticated writes through RLS | Matches fuel/project catalog mutation pattern and centralizes capability/audit checks. |
| Fuel FK safety | Add trigger validating `tipo_combustible_id` exists with same `tenant_id` and `estado='activo'` on create/update | FK only to `tipos_combustible(id)` | FK alone allows cross-tenant references; trigger enforces co-tenancy and active catalog selection. |
| Type immutability | Application rejects type edits when repository says associated records exist; DB helper returns false until operational tables exist | Ignore until operational modules | Issue asks for pending/guarded behavior; helper keeps future DB coupling localized. |

## Data Flow

```text
/dashboard/maquinas -> requireWebAccess -> machines:read
  -> MachineCatalogService.listVisible -> Supabase repository query tenant_id + estado <> 'oculta'
  -> render controls from capabilities

Create/Edit/Status action -> refreshed session -> action gate
  -> application validation/capability check
  -> service_role RPC -> DB capability check + co-tenant fuel validation + audit
  -> revalidatePath('/dashboard/maquinas')
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_create_maquinas.sql` | Create | Table, constraints, indexes, co-tenant fuel trigger, RLS, RPCs, audit trigger, grants. |
| `supabase/tests/maquinas_catalog.sql`, `supabase/tests/maquinas_rpcs.sql` | Create | Isolation, unique code, cross-tenant fuel rejection, status/hide checks. |
| `packages/domain/src/machines/*` | Create | Types, inputs, outcomes, repository contract. |
| `packages/application/src/machines/*` | Create | Capability gates and validation. |
| `packages/infrastructure/src/machines/*` | Create | Supabase repository using list query + RPCs. |
| `packages/*/src/index.ts` | Modify | Export machines modules. |
| `apps/web/app/dashboard/maquinas/page.tsx` | Create | Server page, shell, forms, server actions. |
| `apps/web/app/dashboard/maquinas/page.runtime.test.tsx` | Create | Capability-based UI/runtime tests. |
| `apps/web/app/dashboard/_lib/dashboard-modules.ts`, `page.runtime.test.tsx` | Modify | Change machine href from `/dashboard/machines` to `/dashboard/maquinas`. |

## Interfaces / Contracts

DB: `maquinas(id, tenant_id, codigo, placa, tipo, tipo_combustible_id, tamanio_tanque, modo_medicion_combustible, nivel_inicial_combustible, capacidad_transporte_m3, tarifa_sugerida, estado, created_at, updated_at)`.

Constraints:
- `tipo in ('acarreo','por_tiempo')`; `estado in ('activa','en_mantenimiento','fuera_de_servicio','oculta')`.
- `modo_medicion_combustible in ('exacto','aproximado_porcentaje','sin_medicion')`.
- `codigo` nonblank and unique per tenant, including hidden rows unless owner later asks for code reuse.
- `tamanio_tanque > 0`; `tarifa_sugerida` null or `>= 0`; optional `placa` trimmed.
- `exacto`: `nivel_inicial_combustible` required, `0 <= value <= tamanio_tanque`.
- `aproximado_porcentaje`: required, `0 <= value <= 100`.
- `sin_medicion`: `nivel_inicial_combustible` must be null.
- `capacidad_transporte_m3` optional, but if present requires `tipo='acarreo'` and value `> 0`.

Application errors should mirror catalog style: `missing_tenant`, `missing_machine`, `missing_codigo`, `duplicate_codigo`, `invalid_tipo`, `missing_fuel_type`, `inactive_fuel_type`, `invalid_fuel_measurement`, `invalid_initial_fuel`, `invalid_capacity`, `invalid_rate`, `type_locked_by_records`, `capability_denied`, `machine_create_failed`, `machine_update_failed`, `machine_status_failed`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| SQL | RLS tenant isolation, tenant-local `codigo`, cross-tenant/hidden fuel rejection, hide excluded | `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/maquinas_*.sql` against local DB. |
| Application | `machines:create/update/change_status` gates, validation, type-lock pending test | Vitest package tests, mark lock test pending until first operational table exists. |
| Runtime UI | Admin sees create/edit/status; supervisor read-only; active sidebar route | `page.runtime.test.tsx` with `renderToStaticMarkup`. |
| Quality | Type/lint/build | `pnpm test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm build` when verify runs. |

## Implementation Handoff

### Execution Order
1. DB migration + SQL tests for `maquinas` and RPCs.
2. Domain/application/infrastructure machines packages and unit tests.
3. Dashboard route/nav/page/runtime tests.

### Apply Slices

| Slice | Goal | Files to Read/Edit | Acceptance | Verification |
|---|---|---|---|---|
| 1 | Persist machine catalog safely | `supabase/migrations/*maquinas.sql`, `supabase/tests/maquinas_*.sql` | Tenant isolation, unique code, co-tenant active fuel, hide/status work | `psql ...maquinas_*.sql` |
| 2 | Expose machine service contracts | `packages/domain/src/machines/*`, `packages/application/src/machines/*`, `packages/infrastructure/src/machines/*` | Capability and validation outcomes match issue | `pnpm test -- machines` |
| 3 | Add dashboard UX | `apps/web/app/dashboard/maquinas/page.tsx`, runtime test, dashboard module registry | `/dashboard/maquinas` renders read-only/mutation states correctly | `pnpm test -- maquinas` |

### Constraints for Apply
- Do not implement assignments, jornadas, maintenance, or operational records.
- Preserve service-role RPC + application capability double-gate pattern from fuel/projects.
- Do not expose tenant_id in forms or accept tenant override input.

## Migration / Rollout

No backfill required. New table can roll out after fuel types. Rollback before production data is dropping table/functions/tests; after data exists, disable route/capabilities instead of destructive rollback.

## Review Workload Forecast

400-line budget risk: High. Chained PRs recommended: Yes. Decision needed before apply: Yes. Recommended chain: DB/RPC/tests, then packages/tests, then dashboard route/page/tests.

## Open Questions

- [ ] Should `codigo` be reusable after `oculta`? Current design keeps lifetime tenant uniqueness because issue says unique per tenant and machines are auditable.
