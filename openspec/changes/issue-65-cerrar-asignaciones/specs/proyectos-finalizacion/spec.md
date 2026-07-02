# Proyectos Finalización Specification

## Purpose

Define automatic assignment closure during project/subproject finalization. When a project or subproject is finished, all active machine assignments within its scope MUST be closed atomically, with audit trail and UI feedback.

## Requirements

### Requirement: Project finalization closes assignments

The `finish_proyecto` RPC MUST close all active machine assignments belonging to the project and its subprojects. Assignment closure MAY be controlled via an optional `p_close_assignments` flag (default `true`).

#### Scenario: Finish project with default flag

- GIVEN a project with 3 active assignments (2 direct, 1 in subproject)
- WHEN `finish_proyecto` is invoked with `p_close_assignments = true` (or default)
- THEN all 3 assignments transition to `cerrada_por_finalizacion` with `fecha_fin = now()`
- AND the RPC returns the total count closed (e.g., 3)

#### Scenario: Finish project with closure disabled

- GIVEN a project with 2 active assignments
- WHEN `finish_proyecto` is invoked with `p_close_assignments = false`
- THEN the project is finished but NO assignment state changes

#### Scenario: Project with no active assignments

- GIVEN a project whose assignments are already closed or non-existent
- WHEN `finish_proyecto` is invoked
- THEN the RPC succeeds and returns 0 closed assignments

### Requirement: Subproject finalization closes assignments

The `finish_subproyecto` RPC MUST close all active machine assignments belonging only to that subproject. The same `p_close_assignments` flag applies.

#### Scenario: Finish subproject closes its assignments

- GIVEN a subproject with 2 active assignments
- WHEN `finish_subproyecto` is invoked
- THEN both assignments are closed with estado `cerrada_por_finalizacion`
- AND assignments of sibling subprojects are unaffected

### Requirement: Assignment state transition

Closed assignments MUST set `estado = 'cerrada_por_finalizacion'` and `fecha_fin = now()`. Only rows where `estado = 'activa'` are affected — already closed assignments MUST NOT be touched.

#### Scenario: Only active assignments are closed

- GIVEN a subproject with 1 active and 2 already-closed assignments
- WHEN finalization closes assignments
- THEN only the active assignment transitions; the 2 closed rows remain unchanged

### Requirement: Audit trail for automatic closures

Each assignment closed by finalization MUST produce an audit entry with `source = 'system'`, distinguishing automatic closures from manual ones (`source = 'web'`).

#### Scenario: System audit entry on auto-close

- GIVEN finish_subproyecto closes an active assignment
- WHEN the audit entry is written via the existing trigger
- THEN the entry contains `source = 'system'`, `action = 'UPDATE'`, and the transition from `activa` to `cerrada_por_finalizacion`

### Requirement: Count return for UI feedback

The helper functions MUST return an integer count of assignments closed, enabling the UI to display feedback like "Se cerraron N asignaciones".

#### Scenario: UI receives closure count

- GIVEN finish_proyecto closes 5 assignments
- WHEN the RPC completes
- THEN the returned count is 5, available for the frontend to display

### Requirement: Scope isolation

Assignments outside the finished project or subproject MUST NOT be affected. Subproject finalization MUST scope its UPDATE to `subproyecto_id` only. Project finalization MUST scope to the project's direct assignments plus those of its descendant subprojects.

#### Scenario: Sibling project unaffected

- GIVEN project A and project B, each with 1 active assignment
- WHEN project A is finalized
- THEN project A's assignment is closed; project B's assignment remains active

### Requirement: Transaction atomicity

Assignment closure MUST execute within the same transaction as the finish operation. If the finish RPC rolls back due to any failure, no assignments MUST be closed.

#### Scenario: Rollback on failure

- GIVEN a project with active assignments
- WHEN finish_proyecto fails after the assignment closure step
- THEN the transaction rolls back and all assignments retain their original `activa` state

### Requirement: Concurrent manual withdrawal safety

If a user manually withdraws an assignment (via `update_asignacion`) concurrently with finalization, the UPDATE from finalization MUST be a no-op on that row — the assignment's state reflects whichever operation committed first, without errors or data corruption.

#### Scenario: Manual withdrawal wins race

- GIVEN an active assignment being closed by finish_subproyecto in transaction T1
- AND the same assignment is manually withdrawn in transaction T2
- WHEN T2 commits first, setting estado to a non-active state
- THEN T1's UPDATE affects zero rows for that assignment and no error is raised
- AND the audit trail correctly reflects T2's action
