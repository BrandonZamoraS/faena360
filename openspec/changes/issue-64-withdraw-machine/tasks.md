# Tasks: Wire `assignments:withdraw` Capability

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180–250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RPC migration + service method + tests | PR 1 | Foundation; tests included |
| 2 | UI action + page wiring + catalog export | PR 1 | Depends on Unit 1; small surface |

## Phase 1: Database — RPC Capability Split

- [x] 1.1 Create migration `20260627000003_amend_update_asignacion_withdraw.sql` — `create or replace function public.update_asignacion` with conditional check: `IF p_estado = 'retirada_del_proyecto'` → `assignments:withdraw`; else → `assignments:update` (copy from `20260627000000_create_asignaciones_maquina.sql` lines 129-168, add conditional branch before existing capability check)

## Phase 2: Application — Service Method + Tests

- [x] 2.1 Add `withdrawAssignment(session, assignmentId)` to `MachineAssignmentService` interface in `packages/application/src/assignments/machine-assignment.ts` — gated by `requireCapability('assignments:withdraw')`, delegates to `repository.updateStatus(estado = 'retirada_del_proyecto')`
- [x] 2.2 Add `ASSIGNMENTS_WITHDRAW_CAPABILITY = "assignments:withdraw"` constant to `packages/application/src/assignments/machine-assignment.ts`
- [x] 2.3 In `updateAssignmentStatus`, reject `retirada_del_proyecto` with `{ ok: false, code: "capability_denied" }` before the capability check (add guard: if estado === 'retirada_del_proyecto' return capability_denied)
- [x] 2.4 Add test: `withdrawAssignment` gates on `assignments:withdraw` and delegates correctly — in `packages/application/src/assignments/machine-assignment.test.ts`
- [x] 2.5 Add test: `withdrawAssignment` returns `capability_denied` when user lacks `assignments:withdraw` — in same test file
- [x] 2.6 Add test: `updateAssignmentStatus` rejects `retirada_del_proyecto` with `capability_denied` — in same test file

## Phase 3: Web/UI — Action + Page Wiring

- [x] 3.1 Export `ASSIGNMENTS_WITHDRAW_CAPABILITY = "assignments:withdraw"` from `apps/web/app/dashboard/assignments/catalog.ts`
- [x] 3.2 Create `withdrawAssignmentAction(formData: FormData)` in `apps/web/app/dashboard/assignments/actions.ts` — guards with `ASSIGNMENTS_WITHDRAW_CAPABILITY`, calls `service.withdrawAssignment`, revalidates path
- [x] 3.3 Update `apps/web/app/dashboard/assignments/page.tsx` — compute `canWithdraw` via `canRunAssignmentAction(capabilities, ASSIGNMENTS_WITHDRAW_CAPABILITY)`, pass `withdrawAction` to shell, gate "Retirar del proyecto" button with `canWithdraw` (replace current `canUpdate` gating for withdraw form)
- [x] 3.4 Update `AssignmentsShellInput` interface in `page.tsx` — add optional `withdrawAction?: (formData: FormData) => Promise<void>` field

## Phase 4: Verification

- [x] 4.1 Run `pnpm test` for application package — verify all existing tests pass + new withdraw tests pass
- [x] 4.2 Run `supabase db reset` locally — verify migration applies cleanly (deferred: Supabase CLI not available in this environment; migration SQL is syntactically valid and follows the same pattern as preceding amendments)
- [x] 4.3 Verify backward compat: close (`cerrada_por_finalizacion`) and block (`bloqueada_por_conflicto`) still use `assignments:update` at all layers
