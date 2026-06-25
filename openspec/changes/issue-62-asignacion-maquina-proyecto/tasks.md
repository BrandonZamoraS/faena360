# Tasks: Asignación Activa Máquina-Proyecto-Operador

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450-550 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB + Domain + Infra) → PR 2 (Application + Web) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DB migration + SQL tests + domain port + infra adapter | PR 1 | Base branch: main; self-contained, testable via SQL + unit |
| 2 | Application use cases + Web page + server actions | PR 2 | Base: main (stacked after PR 1 merges); depends on PR 1 types/repo |

## Phase 1: Database Foundation

- [x] 1.1 Create migration `supabase/migrations/20260627000000_create_asignaciones_maquina.sql` with table, indexes (unique partial `uq_asignacion_activa`), FK constraints, CHECKs, RLS deny-all policy. Follow `create_maquinas.sql` pattern.
- [x] 1.2 Add RPC `create_asignacion` (security definer) — validates `assignments:create`, checks machine type=por_tiempo, machine active, project active, operator has rol operador, then INSERT. Set audit context vars. Follow `create_maquina` pattern.
- [x] 1.3 Add RPC `update_asignacion` (security definer) — validates `assignments:update`, updates estado, sets fecha_fin when retiring/closing. Follow `update_maquina` pattern.
- [x] 1.4 Add RPC `list_asignaciones_activas` (security definer) — returns jsonb[] with join to maquinas, proyectos, user_profiles for UI display.
- [x] 1.5 Add audit trigger `audit_asignaciones_maquina` AFTER INSERT/UPDATE/DELETE — follows `audit_maquinas_trigger` pattern, reads `app.current_actor_id`, `app.audit_source`, writes to `audit_log`.
- [x] 1.6 Revoke execute from public/authenticated, grant to service_role on all 3 RPCs.
- [x] 1.7 Create `supabase/tests/asignaciones_maquina_catalog.sql` — test tenant isolation, unique partial index, validation errors (machine type, machine status, project status, operator role), audit trigger fires.

## Phase 2: Domain Layer

- [x] 2.1 Create `packages/domain/src/assignments/machine-assignment.ts` — DTOs (`MachineAssignment`, `CreateAssignmentInput`, `AssignmentEstado`, `AssignmentErrorCode`, `AssignmentOutcome`) and port `MachineAssignmentRepository`. Follow `machine-catalog.ts` pattern.
- [x] 2.2 Create `packages/domain/src/assignments/index.ts` — re-export from `machine-assignment.ts`.
- [x] 2.3 Modify `packages/domain/src/index.ts` — add `export * from "./assignments"`.

## Phase 3: Infrastructure Layer

- [x] 3.1 Create `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` — implement `MachineAssignmentRepository` using service-role client invoking RPCs (`create_asignacion`, `update_asignacion`, `list_asignaciones_activas`). Follow `SupabaseMachineCatalogRepository` pattern.
- [x] 3.2 Create `packages/infrastructure/src/assignments/index.ts` — re-export repository class.

## Phase 4: Application Layer

- [x] 4.1 Create `packages/application/src/assignments/machine-assignment.ts` — use case factory `createMachineAssignmentService` with `createAssignment`, `updateAssignmentStatus`, `listActiveAssignments`. Include capability checks (`assignments:create`, `assignments:update`), domain validations (tipo=por_tiempo, máquina activa, proyecto activo, operador con rol), error mapping (23505→machine_already_assigned, 42501→capability_denied). Follow `machine-catalog.ts` service pattern.
- [x] 4.2 Create `packages/application/src/assignments/machine-assignment.test.ts` — Vitest unit tests: capability denied, missing tenant, invalid input, successful creation, duplicate machine assignment (mock repo throws 23505), status update. Mock `MachineAssignmentRepository` and `capabilityChecker`. Follow `machine-catalog.test.ts` pattern.
- [x] 4.3 Create `packages/application/src/assignments/index.ts` — re-export service factory and types.

## Phase 5: Web UI

- [x] 5.1 Create `apps/web/app/dashboard/assignments/catalog.ts` — server actions `createAssignmentAction`, `updateAssignmentStatusAction` with capability guards, session resolution, error propagation as `throw new Error(code)`. Follow existing server action patterns.
- [x] 5.2 Create `apps/web/app/dashboard/assignments/page.tsx` — server component: header with tenant name, assignment form (machine select, project select, subproject select, operator select, tarifa input with default from machine's tarifa_sugerida), active assignments list with cards showing machine code, project name, operator, tarifa, estado, fecha_inicio. Action buttons "Retirar del proyecto" / "Cerrar por finalización" if `assignments:update`. Follow `maquinas/page.tsx` pattern.
- [x] 5.3 Create `apps/web/app/dashboard/assignments/page.runtime.test.tsx` — runtime test: verify supervisor without `assignments:create` gets redirected or sees readonly view. Mock session with/without capability.

## Phase 6: Verification

- [ ] 6.1 Run `supabase db push` — verify migration applies cleanly, no FK errors.
- [ ] 6.2 Run SQL tests — verify all scenarios in `asignaciones_maquina_catalog.sql` pass.
- [x] 6.3 Run `pnpm test` — verify application unit tests pass.
- [x] 6.4 Run `pnpm -r typecheck` — verify no TypeScript errors across all packages.
- [ ] 6.5 Manual smoke test: create assignment via UI, verify it appears in list, try duplicate (should error), retire assignment, verify fecha_fin set.
