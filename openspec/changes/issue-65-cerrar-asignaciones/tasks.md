# Tasks: Cerrar asignaciones activas al finalizar proyecto o subproyecto

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | TS types → infra repos → app services → web UI flash | PR 1 | Deploy TS first (boolean→int return type) |
| 2 | SQL helpers + modify finish RPCs + SQL tests | PR 2 | DB migrations after TS is live |

## Phase 1: Domain Types (TypeScript Foundation)

- [x] 1.1 Add `closeAssignments?: boolean` to `FinishProjectInput` in `packages/domain/src/projects/project-catalog.ts`
- [x] 1.2 Add `closedAssignmentsCount?: number` to `MutateProjectOutcome` in `packages/domain/src/projects/project-catalog.ts`
- [x] 1.3 Add `closeAssignments?: boolean` to `FinishSubprojectInput` in `packages/domain/src/subprojects/subproject-catalog.ts`
- [x] 1.4 Add `closedAssignmentsCount?: number` to `MutateSubprojectOutcome` in `packages/domain/src/subprojects/subproject-catalog.ts`

## Phase 2: Infrastructure Repositories

- [x] 2.1 Change `finish()` return type from `Promise<boolean>` to `Promise<number>` in `packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.ts`; pass `p_close_assignments: true`; return `response.data as number ?? -1`
- [x] 2.2 Change `finish()` return type from `Promise<boolean>` to `Promise<number>` in `packages/infrastructure/src/subprojects/SupabaseSubprojectCatalogRepository.ts`; pass `p_close_assignments: true`; return `response.data as number ?? -1`

## Phase 3: Application Services

- [x] 3.1 Update `finishProject` in `packages/application/src/projects/project-catalog.ts`: handle `number` return — `-1` → `{ ok: false, code: 'missing_project' }`, `>=0` → `{ ok: true, closedAssignmentsCount }`
- [x] 3.2 Update `finishSubproject` in `packages/application/src/subprojects/subproject-catalog.ts`: same mapping pattern as 3.1

## Phase 4: SQL Helpers and RPC Modifications

- [x] 4.1 Create `supabase/migrations/20260630000000_create_close_assignment_helpers.sql` with `close_assignments_for_project(p_tenant_id, p_project_id)` and `close_assignments_for_subproject(p_tenant_id, p_subproject_id)` returning `int`; set `app.audit_source = 'system'` before UPDATE
- [x] 4.2 Modify `finish_proyecto` in `supabase/migrations/20260624000000_create_proyectos.sql`: add `p_close_assignments bool default true`; call `close_assignments_for_project` when true; return `int` (closed count or -1); update revoke/grant signatures
- [x] 4.3 Modify `finish_subproyecto` in `supabase/migrations/20260626000000_create_subproyectos.sql`: add `p_close_assignments bool default true`; call `close_assignments_for_subproject` when true; return `int`; update revoke/grant signatures

## Phase 5: SQL Tests

- [x] 5.1 Add test: finish project with 3 active assignments (2 direct + 1 subproject) — assert all 3 become `cerrada_por_finalizacion` and RPC returns 3
- [x] 5.2 Add test: finish subproject with 2 active assignments — assert both closed, sibling assignments unaffected
- [x] 5.3 Add test: `p_close_assignments = false` — assert project finishes but no assignment state changes, returns 0
- [x] 5.4 Add test: only `activa` rows affected — seed 1 active + 2 already-closed, assert only active transitions
- [x] 5.5 Add test: audit trail — assert `audit_log` contains `source = 'system'`, `action = 'asignacion.update'` with estado transition

## Phase 6: Web UI Flash Feedback

- [x] 6.1 Update `finishProjectAction` in `apps/web/app/dashboard/proyectos/page.tsx`: on success, redirect to `/dashboard/proyectos?closed=${count}` instead of plain `revalidatePath`
- [x] 6.2 Update `ProyectosPage` default export: read `searchParams.closed` and display toast "Se cerraron N asignaciones" when present
- [x] 6.3 Update `finishSubprojectAction` in `apps/web/app/dashboard/subprojects/page.tsx`: redirect to `/dashboard/subprojects?closed=${count}` on success
- [x] 6.4 Update `SubproyectosPage` default export: read `searchParams.closed` and display same toast pattern
