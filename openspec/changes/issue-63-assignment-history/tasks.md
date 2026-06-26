# Tasks: Consultar Asignaciones Activas e Historial por Rol

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450–650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB+Domain) → PR 2 (App+Infra) → PR 3 (Web UI) → PR 4 (Tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DB migration + domain types | PR 1 | Base = main; self-contained SQL + types |
| 2 | Application service + repository impl | PR 2 | Base = main; depends on PR 1 types |
| 3 | Web UI filters + drawer + server action | PR 3 | Base = main; depends on PR 2 service |
| 4 | All tests (unit + runtime + SQL) | PR 4 | Base = main; verifies PR 1–3 |

## Phase 1: Database + Domain Foundation

- [x] 1.1 Create `supabase/migrations/20260627000002_assignment_history.sql`: modify `audit_asignaciones_maquina()` to include `id` in UPDATE `old_value`/`new_value` via `jsonb_set`.
- [x] 1.2 In same migration, extend `list_asignaciones_activas` with `p_proyecto_id uuid DEFAULT NULL, p_maquina_id uuid DEFAULT NULL` using `coalesce` in WHERE.
- [x] 1.3 In same migration, create `list_asignacion_historial(p_actor_id, p_tenant_id, p_asignacion_id)` RPC with `security definer`, capability check via `app_user_has_capability()`, WHERE on `tenant_id + action LIKE 'asignacion.%' + (new_value->>'id')::uuid`, order `occurred_at DESC`.
- [x] 1.4 In same migration, create 3 indexes: `idx_asignaciones_tenant_proyecto`, `idx_asignaciones_tenant_proyecto_estado`, `idx_audit_log_assignment_id` (partial expression).
- [x] 1.5 In same migration, add revoke/grant execute for both RPCs.
- [x] 1.6 Add `AssignmentHistoryEntry` interface to `packages/domain/src/assignments/machine-assignment.ts`.
- [x] 1.7 Add `MachineAssignmentHistoryFilters` interface to same file.
- [x] 1.8 Extend `MachineAssignmentRepository` port: add `listHistory(input)` signature and optional params to `listActive(input)`.
- [x] 1.9 Re-export new types from `packages/domain/src/assignments/index.ts` (auto via `export *`).

## Phase 2: Application + Infrastructure

- [x] 2.1 Add `listAssignmentHistory(assignmentId)` method to `MachineAssignmentService` in `packages/application/src/assignments/machine-assignment.ts` with `capabilityChecker.requireCapability('assignments:read')` guard.
- [x] 2.2 Implement `listHistory(input)` in `SupabaseMachineAssignmentRepository` at `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` — call RPC `list_asignacion_historial`, map jsonb to `AssignmentHistoryEntry[]`.
- [x] 2.3 Extend `listActive(input)` in same repository to pass `proyectoId` and `maquinaId` as optional RPC params.
- [x] 2.4 Add server action `listAssignmentHistoryAction(assignmentId)` to `apps/web/app/dashboard/assignments/catalog.ts` — call service `listAssignmentHistory`, handle errors.

## Phase 3: Web UI Wiring

- [x] 3.1 In `apps/web/app/dashboard/assignments/page.tsx`, read `proyecto_id` and `maquina_id` from `searchParams`, pass to `listActiveAssignmentsWithJoins`.
- [x] 3.2 Add two `<select>` dropdowns (proyecto, máquina) above the assignments table; onChange updates URL searchParams.
- [x] 3.3 Add "Historial" button per row that opens a `<dialog>` drawer showing timeline from `listAssignmentHistoryAction`.
- [x] 3.4 Render timeline entries: timestamp, action label, actor, diff (old→new fields). Show "Sin cambios registrados" when empty.
- [x] 3.5 Compute `canMutate = canCreate || canUpdate`; hide creation form and action buttons when `!canMutate`, show "modo lectura" banner.
- [x] 3.6 Add empty state message for filtered results: "No hay asignaciones activas para los filtros seleccionados."

## Phase 4: Testing

- [ ] 4.1 Add unit tests in `packages/application/src/assignments/machine-assignment.test.ts`: verify `listAssignmentHistory` calls capability checker before repository, verify `listActive` passes optional filters.
- [ ] 4.2 Add runtime tests in `apps/web/app/dashboard/assignments/page.runtime.test.tsx`: assert filter dropdowns render, drawer opens with timeline entries, `readOnly` mode hides mutation buttons.
- [ ] 4.3 Extend `supabase/tests/asignaciones_maquina_catalog.sql`: test trigger includes `id` in UPDATE diff (jsonb assert).
- [ ] 4.4 In same SQL test file: test `list_asignacion_historial` returns full timeline, empty for non-existent, rejects cross-tenant, requires `assignments:read` (expect 42501).
- [ ] 4.5 In same SQL test file: test `list_asignaciones_activas` with `p_proyecto_id`, `p_maquina_id`, both, and neither — assert correct row counts.
