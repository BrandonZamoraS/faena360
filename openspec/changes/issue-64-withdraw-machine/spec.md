# Machine Assignment Withdrawal Specification

## Purpose

Enforce `assignments:withdraw` at RPC, application, and UI layers for manual machine withdrawal. Split withdrawal from `assignments:update` (close/block). No schema changes.

## Requirements

### Requirement: RPC Capability Split

`update_asignacion` MUST verify `assignments:withdraw` when `p_estado = 'retirada_del_proyecto'`. For `cerrada_por_finalizacion` and `bloqueada_por_conflicto`, it MUST verify `assignments:update`.

(Previously: all estados required `assignments:update`.)

#### Scenario: Admin withdraws active assignment
- GIVEN `estado = 'activa'` and caller holds `assignments:withdraw`
- WHEN `update_asignacion(p_estado = 'retirada_del_proyecto')` runs
- THEN `fecha_fin = now()` and row is updated

#### Scenario: Caller lacks assignments:withdraw
- GIVEN a supervisor without `assignments:withdraw`
- WHEN they attempt withdrawal
- THEN returns `{ ok: false, code: "capability_denied" }`

#### Scenario: Non-existent assignment
- GIVEN an ID that does not exist
- WHEN `update_asignacion` is called with valid estado
- THEN returns `{ ok: false }` (zero rows affected)

#### Scenario: Already withdrawn assignment
- GIVEN `estado = 'retirada_del_proyecto'`
- WHEN withdrawal is attempted again
- THEN returns `{ ok: false }` or state remains unchanged

### Requirement: Application Withdrawal Method

The application MUST expose `withdrawAssignment(session, assignmentId)` gated by `requireCapability('assignments:withdraw')`. `updateAssignmentStatus` MUST reject `retirada_del_proyecto` with `capability_denied`.

#### Scenario: withdrawAssignment delegates correctly
- GIVEN valid session and assignment ID
- WHEN `withdrawAssignment` is called
- THEN `repository.updateStatus(estado = 'retirada_del_proyecto')` is invoked

#### Scenario: updateAssignmentStatus rejects withdrawal
- GIVEN caller with `assignments:update` but not `assignments:withdraw`
- WHEN `updateAssignmentStatus(estado = 'retirada_del_proyecto')` is called
- THEN returns `{ ok: false, code: "capability_denied" }`

### Requirement: UI Withdrawal Guard

The assignments page MUST render the withdraw action only for users holding `assignments:withdraw`. `ASSIGNMENTS_WITHDRAW_CAPABILITY` MUST be exported from catalog.

#### Scenario: Admin sees withdraw action
- GIVEN user has `assignments:withdraw`
- WHEN they view the assignments page
- THEN the withdraw action is visible

#### Scenario: Supervisor does not see withdraw action
- GIVEN user lacks `assignments:withdraw`
- WHEN they view the assignments page
- THEN the withdraw action is absent

### Requirement: Backward Compatibility

Close and block transitions MUST continue using `assignments:update` at all layers.

#### Scenario: Close still works with assignments:update
- GIVEN user with `assignments:update` but not `assignments:withdraw`
- WHEN transitioning to `cerrada_por_finalizacion`
- THEN the operation succeeds

## Data Contracts

| Layer | Change |
|-------|--------|
| RPC `update_asignacion` | `retirada_del_proyecto` → `assignments:withdraw`; others → `assignments:update` |
| Application `withdrawAssignment` | New method: `(session, assignmentId) → AssignmentOutcome` |
| UI `catalog.ts` | New export: `ASSIGNMENTS_WITHDRAW_CAPABILITY` |

No new RPC. No schema changes.

## Security

| Concern | Enforcement |
|---------|-------------|
| Only `assignments:withdraw` holders can withdraw | RPC check + application guard + UI absence |
| Tenant isolation | RPC derives `tenant_id` from JWT (unchanged) |
| RLS unchanged | All access through security-definer RPCs |
| Capability pre-seeded | `administrador` already carries `assignments:withdraw` |

## Out of Scope

- Confirmation dialog (UX polish, not security)
- Withdrawal reason field (not in enunciado)
- Auto-closing open shifts on withdrawal

## Coverage

| Category | Status |
|----------|--------|
| Happy path: admin withdraws active assignment | Covered |
| Error: unauthorized (no `assignments:withdraw`) | Covered |
| Edge: non-existent assignment | Covered |
| Edge: already withdrawn assignment | Covered |
| Machine available after withdrawal | Existing unique partial index: `WHERE estado = 'activa'` |
| History reflects withdrawal | Existing `audit_asignaciones_maquina` trigger |
| Backward compat: close/block unchanged | Covered |
