# Proposal: Wire `assignments:withdraw` Capability

## Intent

The `assignments:withdraw` capability exists in the catalog and is assigned to `administrador`, but no code anywhere checks it. Every state transition—withdraw, close, block—uses `assignments:update`. This makes withdrawal indistinguishable from other transitions at the authorization level, defeating the purpose of having a separate capability.

## Scope

### In Scope
- RPC: split capability check in `update_asignacion`—`assignments:withdraw` for `retirada_del_proyecto`, `assignments:update` for other states
- Application: add `withdrawAssignment` method gated by `assignments:withdraw`; keep `updateAssignmentStatus` for close/block transitions
- UI: guard withdraw button with `assignments:withdraw` capability

### Out of Scope
- Confirmation dialog (UX polish, not security)
- Withdrawal reason field (not in enunciado requirements)
- Auto-closing open shifts on withdrawal (future consideration)

## Capabilities

> Contract with sdd-spec: read `openspec/specs/` before filling.

### New Capabilities
- `machine-assignment-withdraw`: enforce `assignments:withdraw` capability at RPC and application layer for machine withdrawal from a project

### Modified Capabilities
- None (no existing assignment spec; `assignments:update` behavior for close/block remains unchanged)

## Approach

Two-layer enforcement, no schema changes:

**Layer 1 — RPC** (`update_asignacion`): add a conditional capability check. When `p_estado = 'retirada_del_proyecto'`, verify `assignments:withdraw`; for all other estados, verify `assignments:update`. Apply as a migration amendment.

**Layer 2 — Application** (`MachineAssignmentService`): add `withdrawAssignment(session, assignmentId)` method that checks `assignments:withdraw` and delegates to the same repository `updateStatus` with `estado = 'retirada_del_proyecto'`. Retain `updateAssignmentStatus` for close/block, still gated by `assignments:update`.

**Layer 3 — UI** (`catalog.ts`, `page.tsx`): export `ASSIGNMENTS_WITHDRAW_CAPABILITY`; guard the withdraw action with it.

No new RPC. No new table. No migration beyond the single-function amendment.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/20260627...maquina.sql` | Modified | Amend `update_asignacion` capability check |
| `packages/application/src/assignments/machine-assignment.ts` | Modified | Add `withdrawAssignment` method and `ASSIGNMENTS_WITHDRAW_CAPABILITY` |
| `apps/web/app/dashboard/assignments/catalog.ts` | Modified | Export `ASSIGNMENTS_WITHDRAW_CAPABILITY` |
| `apps/web/app/dashboard/assignments/page.tsx` | Modified | Guard withdraw button with correct capability |
| `apps/web/app/dashboard/assignments/actions.ts` | Modified | Add `withdrawAssignmentAction` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Admin locked out of withdrawal after deployment | Low | Capability already assigned to `administrador` role in seed; existing tenants unaffected |
| Existing assignments in `retirada_del_proyecto` become inconsistent | Low | Only active assignments transition through the RPC; historical rows are immutable |
| UI button disappears for admins with only `assignments:update` | Medium | Verify `administrador` role carries both capabilities in all tenant seed paths |

## Rollback Plan

1. Revert the migration amendment to restore `assignments:update`-only check in the RPC
2. Remove `withdrawAssignment` method from the service interface
3. Restore `updateAssignmentStatusAction` to accept `retirada_del_proyecto` with `assignments:update` guard
4. Run `supabase db reset` on affected branches if migration amendment doesn't apply cleanly

Migration amendment is append-only—no data migration, no rollback data loss.

## Dependencies

- None (capability already seeded, roles already assigned)

## Success Criteria

- [ ] RPC `update_asignacion` checks `assignments:withdraw` for `retirada_del_proyecto` estado
- [ ] `withdrawAssignment` method exists and is gated by `assignments:withdraw`
- [ ] UI withdraw button requires `assignments:withdraw` to render
- [ ] Admins can withdraw machines; non-admins see the withdraw button hidden
- [ ] Close and block transitions continue working with `assignments:update`
