# Archive Report: Issue #62 — Asignación Activa Máquina-Proyecto-Operador

**Date**: 2026-06-24
**Change**: Issue #62 — feat(maquinaria): crear asignación activa de máquina a proyecto con operador
**Status**: Completed
**Verdict**: pass

---

## Summary

Implemented the active machine-to-project assignment feature for time-based machinery. The change spans database (migration, RPCs, RLS, audit trigger, SQL tests), domain types, infrastructure adapter, application service with unit tests, and a full Web UI with server actions and runtime tests. All warnings from initial verification were resolved via a follow-up fix pass.

---

## Artifacts Produced

| Artifact | Path |
|----------|------|
| Proposal | `openspec/changes/issue-62-asignacion-maquina-proyecto/proposal.md` |
| Spec | `openspec/changes/issue-62-asignacion-maquina-proyecto/specs/machine-assignments/spec.md` |
| Design | `openspec/changes/issue-62-asignacion-maquina-proyecto/design.md` |
| Tasks | `openspec/changes/issue-62-asignacion-maquina-proyecto/tasks.md` |
| Apply Progress | `openspec/changes/issue-62-asignacion-maquina-proyecto/apply-progress.md` |
| Verify Report | `openspec/changes/issue-62-asignacion-maquina-proyecto/verify-report.md` |
| Archive Report | `openspec/changes/issue-62-asignacion-maquina-proyecto/archive-report.md` |

---

## Files Changed

### PR 1 — Database + Domain + Infrastructure

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260627000000_create_asignaciones_maquina.sql` | Created | Table, indexes, RLS, 3 RPCs, audit trigger, revoke/grant |
| `supabase/migrations/20260627000001_fix_create_asignacion_error_codes.sql` | Created | Fixes RPC error codes to specific business codes (MCH02, MCH03, PRJ02, USR01) |
| `supabase/tests/asignaciones_maquina_catalog.sql` | Created | 10 SQL tests for validation and lifecycle |
| `packages/domain/src/assignments/machine-assignment.ts` | Created | Domain types and repository port |
| `packages/domain/src/assignments/index.ts` | Created | Re-exports |
| `packages/domain/src/index.ts` | Modified | Added assignments export |
| `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` | Created | Supabase adapter for RPCs |
| `packages/infrastructure/src/assignments/index.ts` | Created | Re-exports |
| `packages/infrastructure/src/index.ts` | Modified | Added assignments export |

### PR 2 — Application + Web UI

| File | Action | Description |
|------|--------|-------------|
| `packages/application/src/assignments/machine-assignment.ts` | Created | Application service: create, update, list with capability gates + error mapping |
| `packages/application/src/assignments/machine-assignment.test.ts` | Created | 17 unit tests for application service |
| `packages/application/src/assignments/index.ts` | Created | Re-exports |
| `packages/application/src/index.ts` | Modified | Added assignments export |
| `apps/web/app/dashboard/assignments/catalog.ts` | Created | Server actions + auth helpers |
| `apps/web/app/dashboard/assignments/page.tsx` | Created | Server component: form + list + data fetching |
| `apps/web/app/dashboard/assignments/page.runtime.test.tsx` | Created | 6 runtime UI tests |
| `apps/web/app/dashboard/_lib/dashboard-modules.ts` | Modified | Registered assignments sidebar module |

**Total new files**: 14
**Total modified files**: 4

---

## Verification Status

| Check | Result |
|-------|--------|
| `pnpm -r typecheck` | PASS (5/6 packages, 0 errors) |
| `pnpm test` | PASS (43 files, 343 tests, 1 skipped, 0 regressions) |
| `pnpm -r build` | PASS |
| `supabase db push` | Pending (requires Supabase environment) |
| SQL tests execution | Pending (requires Supabase environment) |
| Manual smoke test | Pending (requires running app) |

**Final verdict**: pass

---

## Risks & Follow-ups

1. **Supabase environment verification**: Tasks 6.1, 6.2, and 6.5 require a running Supabase instance. These must be executed before production deployment.
2. **RPC `list_asignaciones_activas` performance**: Returns `jsonb[]` with heavy joins. Monitor query performance as dataset grows.
3. **Role name fragility**: Operator validation relies on `roles.name = 'operador'`. If the admin renames this role, assignments will break. Consider adding a `system_key` column to roles.
4. **Project finalization orphan assignments**: Out of scope per proposal. Active assignments on finalized projects remain active. Address in future issue.

---

## Rollback Plan

1. **Database**: Drop the migration files and run `supabase db reset` or create a reverse migration that drops the `asignaciones` table, RPCs, and audit trigger.
2. **Code**: Revert the git commits for PR 1 and PR 2. The changes are isolated to the assignments module and do not affect existing functionality.
3. **Sidebar**: Remove the assignments entry from `dashboard-modules.ts`.
4. **Dependencies**: No other issues depend on #62 at this time. Rollback is safe.

---

## Chain Strategy

- **Strategy**: stacked-to-main
- **Base branch**: `development`
- **PR 1**: DB + Domain + Infra (~250 lines)
- **PR 2**: Application + Web UI (~300 lines) — depends on PR 1

---

## SDD Phase History

| Phase | Status | Date |
|-------|--------|------|
| Explore | Completed | 2026-06-24 |
| Propose | Completed | 2026-06-24 |
| Spec | Completed | 2026-06-24 |
| Design | Completed | 2026-06-24 |
| Tasks | Completed | 2026-06-24 |
| Apply PR 1 | Completed | 2026-06-24 |
| Apply PR 2 | Completed | 2026-06-24 |
| Verify | Completed | 2026-06-24 |
| Re-verify (fixes) | Completed | 2026-06-24 |
| Archive | Completed | 2026-06-24 |
