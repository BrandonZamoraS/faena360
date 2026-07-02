# Archive Report: Cerrar asignaciones activas al finalizar proyecto o subproyecto

## Status

**COMPLETE** — All SDD phases finished and implementation committed.

## What Was Implemented

When a project or subproject is finalized, all active machine assignments within its scope are now automatically closed with state `cerrada_por_finalizacion`.

## SDD Artifacts

| Phase | Artifact | Status |
|-------|----------|--------|
| Explore | `openspec/changes/issue-65-cerrar-asignaciones/exploration.md` | ✅ |
| Proposal | `openspec/changes/issue-65-cerrar-asignaciones/proposal.md` | ✅ |
| Spec | `openspec/changes/issue-65-cerrar-asignaciones/specs/proyectos-finalizacion/spec.md` | ✅ |
| Design | `openspec/changes/issue-65-cerrar-asignaciones/design.md` | ✅ |
| Tasks | `openspec/changes/issue-65-cerrar-asignaciones/tasks.md` | ✅ |
| Apply | `sdd/issue-65-cerrar-asignaciones/apply-progress` (engram) | ✅ |
| Verify | `openspec/changes/issue-65-cerrar-asignaciones/verify-report.md` | ✅ |

## Files Changed

### TypeScript Stack
- `packages/domain/src/projects/project-catalog.ts` — added `closedAssignmentsCount` to outcome
- `packages/domain/src/subprojects/subproject-catalog.ts` — same for subprojects
- `packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.ts` — `finish()` returns `Promise<number>`
- `packages/infrastructure/src/subprojects/SupabaseSubprojectCatalogRepository.ts` — same
- `packages/application/src/projects/project-catalog.ts` — maps `-1` to error, count to success
- `packages/application/src/subprojects/subproject-catalog.ts` — same

### Database
- `supabase/migrations/20260630000000_create_close_assignment_helpers.sql` — NEW: `close_assignments_for_project` and `close_assignments_for_subproject`
- `supabase/migrations/20260624000000_create_proyectos.sql` — MODIFIED: `finish_proyecto` returns `int`, adds `p_close_assignments`
- `supabase/migrations/20260626000000_create_subproyectos.sql` — MODIFIED: `finish_subproyecto` returns `int`, adds `p_close_assignments`

### Tests
- `supabase/tests/asignaciones_maquina_catalog.sql` — +5 tests (scope, audit, opt-out, active-only, race)
- `packages/application/src/projects/project-catalog.test.ts` — fixed mock return type
- `packages/application/src/subprojects/subproject-catalog.test.ts` — fixed mock return type

### UI
- `apps/web/app/dashboard/proyectos/page.tsx` — query-param flash `?closed=N` + toast
- `apps/web/app/dashboard/subprojects/page.tsx` — same pattern

## Verification Status

**PASS** — All 8 spec requirements verified:
- ✅ Project finalization closes assignments
- ✅ Subproject finalization closes assignments
- ✅ Only `activa` rows affected
- ✅ Audit trail with `source = 'system'`
- ✅ Count return for UI feedback
- ✅ Scope isolation (sibling subprojects unaffected)
- ✅ Transaction atomicity
- ✅ Race condition safety (manual withdrawal concurrent)

## Critical Issues Fixed During Verify

1. Test mock `finish: async () => false` → changed to `finish: async () => -1` (boolean → number)
2. Test mock `finish: async () => true` → changed to `finish: async () => 3` (boolean → number)

## Commit

`5c29bf4` — `feat(assignments): auto-close active assignments on project/subproject finish (#65)`

## Follow-up Work

- Apply DB migrations in production (SQL helpers + RPC modifications)
- Execute `NOTIFY pgrst, 'reload schema';` after migration
- No additional code changes needed

## GitHub Issue

https://github.com/BrandonZamoraS/faena360/issues/65
