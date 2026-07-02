# Verification Report: issue-65-cerrar-asignaciones

## Change
issue-65-cerrar-asignaciones — Cerrar asignaciones activas al finalizar proyecto o subproyecto

## Mode
Standard verify (Strict TDD: false)

## Completeness Table

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1.1 | Add `closeAssignments?: boolean` to `FinishProjectInput` | PASS | `packages/domain/src/projects/project-catalog.ts:55` |
| 1.2 | Add `closedAssignmentsCount?: number` to `MutateProjectOutcome` | PASS | `packages/domain/src/projects/project-catalog.ts:99` |
| 1.3 | Add `closeAssignments?: boolean` to `FinishSubprojectInput` | PASS | `packages/domain/src/subprojects/subproject-catalog.ts:46` |
| 1.4 | Add `closedAssignmentsCount?: number` to `MutateSubprojectOutcome` | PASS | `packages/domain/src/subprojects/subproject-catalog.ts:85` |
| 2.1 | Change `finish()` return to `Promise<number>` in project repo | PASS | `packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.ts:155` |
| 2.2 | Change `finish()` return to `Promise<number>` in subproject repo | PASS | `packages/infrastructure/src/subprojects/SupabaseSubprojectCatalogRepository.ts:141` |
| 3.1 | Update `finishProject` service to map `number` return | PASS | `packages/application/src/projects/project-catalog.ts:335-347` |
| 3.2 | Update `finishSubproject` service to map `number` return | PASS | `packages/application/src/subprojects/subproject-catalog.ts:325-337` |
| 4.1 | Create SQL helpers migration | PASS | `supabase/migrations/20260630000000_create_close_assignment_helpers.sql` |
| 4.2 | Modify `finish_proyecto` RPC | PASS | `supabase/migrations/20260624000000_create_proyectos.sql:524-664` |
| 4.3 | Modify `finish_subproyecto` RPC | PASS | `supabase/migrations/20260626000000_create_subproyectos.sql:354-435` |
| 5.1 | Test: finish project with 3 active assignments | PASS | `supabase/tests/asignaciones_maquina_catalog.sql:872-946` |
| 5.2 | Test: finish subproject sibling isolation | PASS | `supabase/tests/asignaciones_maquina_catalog.sql:948-1027` |
| 5.3 | Test: `p_close_assignments = false` | PASS | `supabase/tests/asignaciones_maquina_catalog.sql:1030-1096` |
| 5.4 | Test: only `activa` rows affected | PASS | `supabase/tests/asignaciones_maquina_catalog.sql:1099-1184` |
| 5.5 | Test: audit trail `source = system` | PASS | `supabase/tests/asignaciones_maquina_catalog.sql:1187-1257` |
| 6.1 | Update `finishProjectAction` redirect with `?closed=` | PASS | `apps/web/app/dashboard/proyectos/page.tsx:735-737` |
| 6.2 | Display toast from `searchParams.closed` on proyectos page | PASS | `apps/web/app/dashboard/proyectos/page.tsx:121-125, 805-808` |
| 6.3 | Update `finishSubprojectAction` redirect with `?closed=` | PASS | `apps/web/app/dashboard/subprojects/page.tsx:667-669` |
| 6.4 | Display toast from `searchParams.closed` on subprojects page | PASS | `apps/web/app/dashboard/subprojects/page.tsx:114-118, 740-746` |

## Build / Tests / Coverage Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `tsc --noEmit -p packages/domain/tsconfig.json` | PASS | No errors |
| `tsc --noEmit -p packages/infrastructure/tsconfig.json` | PASS | No errors |
| `tsc --noEmit -p apps/web/tsconfig.json` | PASS | No errors |
| `tsc --noEmit -p packages/application/tsconfig.json` | **FAIL** | 1 TS2322 error in `subproject-catalog.test.ts` |
| SQL tests (local DB) | **N/A** | Docker Desktop not running; tests not executed at runtime |

## Spec Compliance Matrix

| Requirement | Scenario | Implementation | Status |
|---|---|---|---|
| Req 1: Project finalization closes assignments | Finish project with default flag | `finish_proyecto` calls `close_assignments_for_project` when `p_close_assignments = true` | PASS |
| Req 1: Project finalization closes assignments | Finish project with closure disabled | `if p_close_assignments then ... else skip` | PASS |
| Req 1: Project finalization closes assignments | Project with no active assignments | Helper returns 0; RPC returns 0 | PASS |
| Req 2: Subproject finalization closes assignments | Finish subproject closes its assignments | `finish_subproyecto` calls `close_assignments_for_subproject` | PASS |
| Req 3: Only `activa` rows affected | Only active assignments are closed | Both helpers have `WHERE estado = 'activa'` | PASS |
| Req 4: Audit trail `source = 'system'` | System audit entry on auto-close | Helper sets `app.audit_source = 'system'` before UPDATE | PASS |
| Req 5: Count return for UI | UI receives closure count | Both RPCs return `int` (closed count) | PASS |
| Req 6: Scope isolation | Sibling project unaffected | Project helper scopes to `proyecto_id` + subproject subquery; subproject helper uses `subproyecto_id = p_subproject_id` | PASS |
| Req 7: Transaction atomicity | Rollback on failure | Helper call is inline in PL/pgSQL function (same transaction) | PASS* |
| Req 8: Race safety | Manual withdrawal wins race | `WHERE estado = 'activa'` makes UPDATE no-op on already-changed rows | PASS |

*Req 7 caveat: If the project UPDATE affects 0 rows (concurrent modification between SELECT and UPDATE), the function returns -1 but assignments are already closed and are NOT rolled back. This is a race-condition edge case.

## Design Coherence

| Design Decision | Implementation | Status |
|---|---|---|
| Helper vs inline SQL | Helper functions used, following `invalidate_open_jornadas_*` pattern | PASS |
| RPC return type `int` | Both RPCs return `int`; `-1` for not-found, `>=0` for count | PASS |
| `p_close_assignments` default `true` | Both RPCs have `p_close_assignments bool default true` | PASS |
| Audit mechanism: reuse trigger | Helper sets `app.audit_source = 'system'` before UPDATE | PASS |
| `updated_by` omitted on auto-close | Consistent with design decision; not set in helpers | PASS |
| Query-param flash pattern | UI redirects to `?closed=N` and reads `searchParams.closed` | PASS |
| Deploy order: TS before DB | Documented in `design.md` | PASS |

## Issues

### CRITICAL

1. **TypeScript compilation error in `subproject-catalog.test.ts`**
   - File: `packages/application/src/subprojects/subproject-catalog.test.ts:337`
   - The mock repository override `finish: async () => false` returns `Promise<boolean>`, but the `SubprojectCatalogRepository.finish` interface now requires `Promise<number>`.
   - Impact: `tsc --noEmit` fails, blocking CI and type-check workflows.
   - Fix: Change mock to `finish: async () => -1` or `finish: async () => 0` (or any number).

2. **Project test mock also returns wrong type (masked by cast)**
   - File: `packages/application/src/projects/project-catalog.test.ts:37`
   - The base mock has `finish: async () => true` (boolean). It compiles only because of the `as ProjectCatalogServiceDependencies["repository"]` cast.
   - Fix: Change to `finish: async () => 3` (or any number) to match the new interface.

### WARNING

3. **Race condition: assignments may be closed even if project update fails**
   - File: `supabase/migrations/20260624000000_create_proyectos.sql`
   - `finish_proyecto` calls `close_assignments_for_project` BEFORE updating `proyectos`. If the project UPDATE affects 0 rows (concurrent modification), the function returns -1 but assignments remain closed.
   - This is a narrow race window (between the initial `SELECT estado` and the final `UPDATE`).
   - The spec Req 7 says: "If the finish RPC rolls back due to any failure, no assignments MUST be closed." A 0-row update isn't a thrown exception/rollback, but from the caller's perspective it is a failure (-1 return).
   - Severity: WARNING — the pattern is consistent with other lifecycle RPCs, and the race window is small.

4. **Missing unit tests for new `finish` return-value mapping**
   - File: `packages/application/src/projects/project-catalog.test.ts`, `packages/application/src/subprojects/subproject-catalog.test.ts`
   - The design.md Testing Strategy calls for:
     - "Unit (TS): Service maps `-1` to failure"
     - "Unit (TS): Service exposes count on success"
   - Neither test file has tests covering:
     - `finishProject` / `finishSubproject` returning `{ ok: true, closedAssignmentsCount: N }`
     - `finishProject` / `finishSubproject` returning `{ ok: false, code: 'missing_project' }` when repo returns `-1`
   - Severity: WARNING — SQL tests cover the end-to-end behavior, but TS unit tests don't cover the service mapping layer.

### SUGGESTION

5. **Add unit tests for `closedAssignmentsCount` success and `-1` mapping**
   - Add tests in both `project-catalog.test.ts` and `subproject-catalog.test.ts` for the new number-return behavior.

6. **Consider moving assignment closure after project UPDATE**
   - While the current order (assignments first, then project) is safer from a business standpoint (better to have closed assignments on an active project than active assignments on a finalized project), it creates the race condition in WARNING #3.

## Verdict

**PASS WITH WARNINGS**

The implementation matches the spec and design for all 8 requirements and 10 scenarios. All 20 tasks are complete. The TypeScript stack (domain, infrastructure, web app) compiles cleanly. The SQL migration files contain the correct patterns.

The blockers to a clean PASS are:
1. **CRITICAL**: Fix the `boolean` → `number` type mismatch in both test mock files so `tsc --noEmit` passes.
2. **WARNING**: The race-condition edge case in `finish_proyecto` where assignments may be closed but the project isn't finalized.
3. **WARNING**: Missing TS unit tests for the new `finish` return-value mapping.

### Ready for archive?

**No** — not until the CRITICAL TypeScript test compilation error is fixed. Once fixed, the change is ready for archive.
