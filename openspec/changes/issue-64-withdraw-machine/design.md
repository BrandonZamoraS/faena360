# Design: Wire `assignments:withdraw` Capability

## Technical Approach

Add capability-gated withdrawal to the three-layer stack (RPC → Service → UI) without schema changes. Split the monolithic `assignments:update` check so withdrawal requires `assignments:withdraw`.

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|---|---|---|---|
| RPC capability split | A) Amend `update_asignacion` to branch on estado; B) Create new `withdraw_asignacion` RPC | A) Simpler, no new RPC; B) Cleaner separation but more boilerplate | A — amend existing RPC with conditional check |
| Service method | A) Add `withdrawAssignment`; B) Overload `updateAssignmentStatus` with estado-based capability | A) Explicit contract, aligns with RPC; B) Fewer methods but hidden branching | A — dedicated `withdrawAssignment` method |
| Server action | A) New `withdrawAssignmentAction`; B) Reuse `updateAssignmentStatusAction` | A) Type-safe, clear capability gate; B) Less code but conflates concerns | A — new action to match service method |
| UI button gating | A) `canWithdraw` capability; B) Keep `canUpdate` | A) Correct security model; B) Least privilege violated | A — separate `canWithdraw` check |

## Data Flow

```
UI (page.tsx)
 └─ form action ──→ withdrawAssignmentAction (actions.ts)
      └─ guard assignments:withdraw ──→ MachineAssignmentService.withdrawAssignment
           └─ guard assignments:withdraw ──→ SupabaseMachineAssignmentRepository.updateStatus
                └─ RPC update_asignacion
                     └─ IF p_estado = 'retirada_del_proyecto' THEN check assignments:withdraw
                        ELSE check assignments:update
                     └─ UPDATE asignaciones_maquina
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_amend_update_asignacion_withdraw.sql` | Create | New migration: `create or replace function public.update_asignacion` with conditional capability check |
| `packages/application/src/assignments/machine-assignment.ts` | Modify | Add `withdrawAssignment` to interface and implementation; add `ASSIGNMENTS_WITHDRAW_CAPABILITY` constant |
| `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` | None | No changes; existing `updateStatus` works for both paths |
| `apps/web/app/dashboard/assignments/catalog.ts` | Modify | Export `ASSIGNMENTS_WITHDRAW_CAPABILITY = "assignments:withdraw"` |
| `apps/web/app/dashboard/assignments/actions.ts` | Modify | Add `withdrawAssignmentAction` guarded by `ASSIGNMENTS_WITHDRAW_CAPABILITY` |
| `apps/web/app/dashboard/assignments/page.tsx` | Modify | Compute `canWithdraw`; pass `withdrawAction`; gate "Retirar del proyecto" button |

## Interfaces / Contracts

### Application Service

```typescript
// Added to MachineAssignmentService interface
withdrawAssignment(
  session: TenantSessionScope,
  assignmentId: string
): Promise<AssignmentOutcome>;
```

### Server Action

```typescript
export async function withdrawAssignmentAction(formData: FormData): Promise<void>;
```

### RPC

```sql
-- Conditional capability check inside update_asignacion
IF p_estado = 'retirada_del_proyecto' THEN
  IF NOT app_user_has_capability(p_actor_id, v_tenant_id, 'assignments:withdraw')
    THEN RAISE EXCEPTION ... USING ERRCODE = '42501';
  END IF;
ELSE
  IF NOT app_user_has_capability(p_actor_id, v_tenant_id, 'assignments:update')
    THEN RAISE EXCEPTION ... USING ERRCODE = '42501';
  END IF;
END IF;
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Service `withdrawAssignment` gates on `assignments:withdraw`; `updateAssignmentStatus` still gates on `assignments:update` | Mock capability checker and repository |
| Unit | `withdrawAssignmentAction` rejects missing capability | Mock session and service |
| UI | "Retirar del proyecto" hidden without `assignments:withdraw`; visible with it | Component test or story with mocked capabilities |
| Integration | RPC rejects withdrawal with `assignments:update` only; accepts with `assignments:withdraw` | DB test via Supabase client |

## Migration / Rollout

Create a new migration with `create or replace function public.update_asignacion(...)`. The function change is backward-compatible for non-withdrawal transitions. Rollback: drop and recreate the previous function version.

## Open Questions

None.
