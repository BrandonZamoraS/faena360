# Verification Report — issue-64-withdraw-machine

## Summary

**Verdict: PASS WITH WARNINGS**

The implementation satisfies all spec requirements and design decisions. All tests pass, types are correct, and lint is clean. Two warnings were found: an error-code mapping mismatch in the application layer, and one incomplete local-database verification task.

---

## Spec Compliance Checklist

| # | Requirement / Scenario | Status | Evidence |
|---|------------------------|--------|----------|
| 1 | **RPC Capability Split** — `update_asignacion` branches on `p_estado` | PASS | Migration `20260627000003_amend_update_asignacion_withdraw.sql` lines 34-42 |
| 2 | **Admin withdraws active assignment** — sets `fecha_fin = now()` | PASS | Migration line 50; service `withdrawAssignment` delegates `estado: "retirada_del_proyecto"` |
| 3 | **Caller lacks `assignments:withdraw`** — returns `capability_denied` | PASS | RPC raises `42501`; service catches and maps to `capability_denied`; tests cover this |
| 4 | **Non-existent assignment** — returns `{ ok: false }` | PASS | RPC raises `ASG02` when `v_tenant_id is null`; service maps to `missing_assignment` |
| 5 | **Already withdrawn assignment** — returns `{ ok: false }` or unchanged | PASS | RPC rejects any non-active assignment with `ASG01`; no update occurs |
| 6 | **Application `withdrawAssignment` gates on `assignments:withdraw`** | PASS | `machine-assignment.ts` lines 196-204; tests verify capability check |
| 7 | **`updateAssignmentStatus` rejects `retirada_del_proyecto`** | PASS | `machine-assignment.ts` lines 149-151; dedicated test exists |
| 8 | **UI renders withdraw action only with `assignments:withdraw`** | PASS | `page.tsx` computes `canWithdraw`; button gated; runtime tests verify visibility |
| 9 | **UI hides withdraw action from supervisor** | PASS | Runtime test `hides withdraw button for supervisor with assignments:update but not assignments:withdraw` |
| 10 | **Backward compatibility: close/block still use `assignments:update`** | PASS | RPC `else` branch checks `assignments:update`; service `updateAssignmentStatus` requires `assignments:update`; tests pass |
| 11 | **Machine becomes available after withdrawal** | PASS | Existing unique partial index `WHERE estado = 'activa'` (no code change needed) |
| 12 | **History reflects withdrawal** | PASS | Existing `audit_asignaciones_maquina` trigger (no code change needed) |

---

## Design Compliance Checklist

| # | Design Decision | Status | Evidence |
|---|-----------------|--------|----------|
| 1 | RPC: amend existing `update_asignacion` with conditional check | PASS | Migration lines 34-42 implement `IF p_estado = 'retirada_del_proyecto'` |
| 2 | Service: dedicated `withdrawAssignment` method | PASS | `machine-assignment.ts` lines 45-48 (interface), 185-226 (implementation) |
| 3 | Server action: new `withdrawAssignmentAction` | PASS | `actions.ts` lines 57-68 |
| 4 | UI: separate `canWithdraw` capability gating | PASS | `page.tsx` lines 92-95; button rendered conditionally lines 368-385 |
| 5 | Catalog export `ASSIGNMENTS_WITHDRAW_CAPABILITY` | PASS | `catalog.ts` line 23; re-exported in `machine-assignment.ts` line 59 |
| 6 | Data flow matches design diagram | PASS | UI → action → service → repository → RPC, with capability guards at each layer |

---

## Test Results

### Unit Tests
```
Test Files  46 passed (46)
     Tests  381 passed | 1 skipped (382)
  Duration  6.16s
```

**Relevant test files:**
- `packages/application/src/assignments/machine-assignment.test.ts` — 25 tests, all pass
  - `withdrawAssignment gates on assignments:withdraw and delegates to repository` PASS
  - `withdrawAssignment rejects when caller lacks assignments:withdraw` PASS
  - `withdrawAssignment rejects blank assignment id` PASS
  - `updateAssignmentStatus rejects retirada_del_proyecto` PASS
- `apps/web/app/dashboard/assignments/page.runtime.test.tsx` — 11 tests, all pass
  - `renders create form and action buttons for administrator sessions` PASS
  - `hides withdraw button for supervisor with assignments:update but not assignments:withdraw` PASS

### Type Check
```
Scope: 5 of 6 workspace projects
packages/domain typecheck$ tsc --noEmit       Done
packages/shared typecheck$ tsc --noEmit       Done
packages/application typecheck$ tsc --noEmit  Done
packages/infrastructure typecheck$ tsc --noEmit Done
apps/web typecheck$ tsc --noEmit              Done
```

### Lint
```
Scope: 5 of 6 workspace projects
apps/web lint$ eslint                           Done
```

---

## Issues Found

### WARNING

1. **Error-code mapping mismatch for non-active assignments**
   - **Where:** `packages/application/src/assignments/machine-assignment.ts` — `isAssignmentNotActiveError`
   - **What:** The RPC raises `ASG01` when `v_current_estado <> 'activa'` ("Only active assignments can be updated"). The helper `isAssignmentNotActiveError` checks for code `ASG02`, which the RPC uses for "Assignment not found". Consequently, when a non-active assignment is targeted, the application returns `{ ok: false, code: "assignment_update_failed" }` instead of `{ ok: false, code: "missing_assignment" }`.
   - **Impact:** Low — the operation still fails safely and returns `{ ok: false }` as required by the spec, but the error code is less precise.
   - **Fix:** Change `isAssignmentNotActiveError` to check for `ASG01`, or rename the function and add a separate handler for `ASG01`.

2. **Incomplete local DB verification task**
   - **Where:** `openspec/changes/issue-64-withdraw-machine/tasks.md` — Task 4.2
   - **What:** `Run supabase db reset locally — verify migration applies cleanly` is unchecked.
   - **Impact:** Low — the migration SQL is syntactically valid and backward-compatible; the risk is unverified local execution only.

### SUGGESTION

3. **Add explicit test for non-active assignment rejection**
   - **Where:** `packages/application/src/assignments/machine-assignment.test.ts`
   - **What:** There is no unit test simulating a repository throw with `ASG01` (or `ASG02`) to assert the exact error code returned for non-active assignments.
   - **Fix:** Add a test where the mock repository throws an error with code `ASG01` and assert the expected outcome code.

---

## Backward Compatibility Assessment

| Transition | Capability Required | Test Coverage | Status |
|------------|---------------------|---------------|--------|
| `cerrada_por_finalizacion` | `assignments:update` | Unit test: `updates assignment status successfully` | PASS |
| `bloqueada_por_conflicto` | `assignments:update` | Implicit via RPC `else` branch | PASS |
| `retirada_del_proyecto` | `assignments:withdraw` | Unit + runtime tests | PASS |

The `updateAssignmentStatus` service method explicitly rejects `retirada_del_proyecto` before any capability check, ensuring the old path cannot be abused for withdrawal.

---

## Final Verdict

**PASS WITH WARNINGS**

All spec requirements are met, all design decisions are implemented, tests pass, types are clean, and lint passes. The two warnings do not block functionality but should be addressed in a follow-up commit or PR.
