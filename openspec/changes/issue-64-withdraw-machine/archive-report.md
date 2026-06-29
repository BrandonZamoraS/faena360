# Archive Report: issue-64-withdraw-machine

## Change Summary

Implemented manual machine withdrawal from projects for admin users. The `assignments:withdraw` capability — already seeded in the database and assigned to the `administrador` role — was wired through the entire stack (RPC → application service → UI), separating withdrawal authorization from generic assignment updates.

### What changed
- **Database**: Recreated `update_asignacion` RPC with conditional capability check (`assignments:withdraw` for `retirada_del_proyecto`, `assignments:update` for other states).
- **Application**: Added `withdrawAssignment` method to `MachineAssignmentService` with dedicated capability gate. `updateAssignmentStatus` now rejects `retirada_del_proyecto` transitions.
- **Web/UI**: Added `withdrawAssignmentAction` server action, gated "Retirar del proyecto" button with `canWithdraw`, wired to the new action.
- **Tests**: Added 5 new unit tests (withdraw success, withdraw denied, update rejects withdrawal, ASG01 mapping for both methods).

## Artifacts Produced

| Phase | File |
|-------|------|
| Proposal | `openspec/changes/issue-64-withdraw-machine/proposal.md` |
| Spec | `openspec/changes/issue-64-withdraw-machine/spec.md` |
| Design | `openspec/changes/issue-64-withdraw-machine/design.md` |
| Tasks | `openspec/changes/issue-64-withdraw-machine/tasks.md` |
| Verify | `openspec/changes/issue-64-withdraw-machine/verify-report.md` |
| Archive | `openspec/changes/issue-64-withdraw-machine/archive-report.md` |

## Implementation Files

| File | Action |
|------|--------|
| `supabase/migrations/20260627000003_amend_update_asignacion_withdraw.sql` | Created |
| `packages/application/src/assignments/machine-assignment.ts` | Modified |
| `packages/application/src/assignments/machine-assignment.test.ts` | Modified |
| `apps/web/app/dashboard/assignments/catalog.ts` | Modified |
| `apps/web/app/dashboard/assignments/actions.ts` | Modified |
| `apps/web/app/dashboard/assignments/page.tsx` | Modified |
| `apps/web/app/dashboard/assignments/page.runtime.test.tsx` | Modified |

## Verification Status

**PASS** — after fixes applied during verify phase.

- Tests: 383 passed, 0 failed, 1 skipped
- Typecheck: 5/5 projects pass
- Lint: Clean

## Known Issues

1. **Task 4.2 (`supabase db reset`)**: Could not be executed locally due to missing Supabase CLI. The migration SQL is syntactically valid and follows the same pattern as preceding amendments.

2. **Error code mapping fix applied**: `isAssignmentNotActiveError` was checking `ASG02` but the RPC raises `ASG01` for non-active assignments. Fixed during verify phase.

## Rollout Notes

1. Apply migration `20260627000003_amend_update_asignacion_withdraw.sql` to the database.
2. No seed or capability changes needed — `assignments:withdraw` already exists in the catalog and admin role.
3. Deploy code changes as a single PR targeting `development` branch.
4. After merge, verify that admin users can withdraw assignments and supervisor users cannot see the withdraw action.

## PR

- Single PR recommended (within 400-line budget).
- Estimated changed lines: ~220–250.
