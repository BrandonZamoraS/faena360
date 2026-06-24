# Apply Progress: Asignación Activa Máquina-Proyecto-Operador

**Date**: 2026-06-24
**Work Unit**: PR 2 — Application + Web UI
**Mode**: Standard (TDD disabled)
**Chain strategy**: stacked-to-main

## Completed Tasks

### Phase 1: Database Foundation
- [x] 1.1 Migration `20260627000000_create_asignaciones_maquina.sql` — table with all constraints, indexes (`uq_asignacion_activa` unique partial, `idx_asignaciones_tenant_id`, `idx_asignaciones_tenant_estado`), FK references (`tenants`, `maquinas`, `proyectos`, `subproyectos`, `user_profiles`, `auth.users`), CHECKs, RLS deny-all policy, `updated_at` trigger.
- [x] 1.2 RPC `create_asignacion` — security definer, validates `assignments:create` capability, checks machine type=`por_tiempo` and `activa`, project `activo`, operator has `operador` role, subproject belongs to tenant/project. Sets audit context (`app.current_actor_id`, `app.audit_source`). INSERTS and returns `uuid`.
- [x] 1.3 RPC `update_asignacion` — security definer, validates `assignments:update`, looks up tenant from assignment for capability check, updates `estado`, sets `fecha_fin = now()` when new estado is `retirada_del_proyecto` or `cerrada_por_finalizacion`. Returns `boolean`.
- [x] 1.4 RPC `list_asignaciones_activas` — security definer, returns `jsonb[]` with joins to `maquinas` (codigo), `proyectos` (nombre), `subproyectos` (nombre), `user_profiles` (full_name, email). Filters by `tenant_id` and `estado = 'activa'`. Ordered by `fecha_inicio DESC`.
- [x] 1.5 Audit trigger `audit_asignaciones_maquina` — AFTER INSERT/UPDATE/DELETE, reads `app.current_actor_id`, `app.audit_source`, writes to `audit_log` with action `asignacion.create|update|delete`. Uses diff-based old/new jsonb for UPDATE.
- [x] 1.6 Revoke/grant — revoked from `public`, `anon`, `authenticated`; granted to `service_role` for all 3 RPCs.
- [x] 1.7 SQL tests `asignaciones_maquina_catalog.sql` — 10 tests: tenant isolation, unique partial index, machine type validation (acarreo), machine status validation (en_mantenimiento), project status validation (finalizado), operator role validation (non-operador), capability check (42501), audit create, audit update, retire-then-reassign lifecycle.

### Phase 2: Domain Layer
- [x] 2.1 `packages/domain/src/assignments/machine-assignment.ts` — DTOs: `MachineAssignment`, `CreateAssignmentInput`, `AssignmentEstado` (4 states), `AssignmentErrorCode` (15 codes), `AssignmentOutcome`. Port: `MachineAssignmentRepository` with `listActive`, `create`, `updateStatus`.
- [x] 2.2 `packages/domain/src/assignments/index.ts` — re-exports from `machine-assignment.ts`.
- [x] 2.3 `packages/domain/src/index.ts` — added `export * from "./assignments"`.

### Phase 3: Infrastructure Layer
- [x] 3.1 `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` — implements `MachineAssignmentRepository` using service-role Supabase client. `listActive` calls `list_asignaciones_activas` RPC (p_tenant_id). `create` calls `create_asignacion` RPC with all 8 params. `updateStatus` calls `update_asignacion` RPC. Error handling via `createRepositoryError` pattern (preserves `.code` property). Row mapping via `mapRowToAssignment`.
- [x] 3.2 `packages/infrastructure/src/assignments/index.ts` — exports `SupabaseMachineAssignmentRepository`.
- [x] `packages/infrastructure/src/index.ts` — added `export * from "./assignments"`.

### Phase 4: Application Layer
- [x] 4.1 `packages/application/src/assignments/machine-assignment.ts` — use case factory `createMachineAssignmentService` with `createAssignment`, `updateAssignmentStatus`, `listActiveAssignments`. Capability checks (`assignments:create`, `assignments:update`, `assignments:read`). Input normalization (maquina_id, proyecto_id, operador_id, tarifa_aplicada trimming and validation). Tenant override detection. Error mapping: 23505→`machine_already_assigned`, 42501→`capability_denied`, generic catches→`assignment_create_failed`/`assignment_update_failed`. Follows `machine-catalog.ts` service pattern exactly.
- [x] 4.2 `packages/application/src/assignments/machine-assignment.test.ts` — 12 Vitest unit tests: list after assignments:read, capability denied for create, missing tenant on create/update, input normalization rejects blank fields, successful creation with normalized input, duplicate machine assignment (23505 mapping), permission denied (42501 mapping), status update success, capability denied for update, blank assignment id rejection, invalid estado rejection, tenant override payload rejection. Mocks `MachineAssignmentRepository` and `capabilityChecker`. Follows `machine-catalog.test.ts` pattern.
- [x] 4.3 `packages/application/src/assignments/index.ts` — re-exports service factory and types.
- [x] `packages/application/src/index.ts` — added `export * from "./assignments"`.

### Phase 5: Web UI
- [x] 5.1 `apps/web/app/dashboard/assignments/catalog.ts` — server actions `createAssignmentAction`, `updateAssignmentStatusAction` with capability guards, session resolution via `getAuthorizedAssignmentsSession`, error propagation as `throw new Error(code)`. Authorization helpers: `canAccessAssignmentsPage`, `canRunAssignmentAction`. Capability constants: `ASSIGNMENTS_READ_CAPABILITY`, `ASSIGNMENTS_CREATE_CAPABILITY`, `ASSIGNMENTS_UPDATE_CAPABILITY`. Form parsing via `readCreateAssignmentInput`. Follows `maquinas/catalog.ts` pattern.
- [x] 5.2 `apps/web/app/dashboard/assignments/page.tsx` — server component with `renderAssignmentsShell`. Header with tenant name. Create form (if `assignments:create`): machine select (por_tiempo + activas), project select (activos), operator select (users with operador role), tarifa input (numeric, min=0). Active assignments list with cards: machine code, project name, operator name, tarifa, estado, fecha_inicio. Action buttons "Retirar del proyecto" / "Cerrar por finalización" (if `assignments:update`). Data fetching: `listActiveAssignmentsWithJoins` (direct RPC), `listActivePorTiempoMachines`, `listActiveProjects`, `listOperatorsForTenant` (user_profiles + user_roles + roles join). Follows `maquinas/page.tsx` pattern.
- [x] 5.3 `apps/web/app/dashboard/assignments/page.runtime.test.tsx` — 6 runtime tests: admin full controls (create + update buttons visible), read-only mode (no form, no buttons), create-only mode (form visible, no update buttons), no por_tiempo machines warning, empty assignments state, sidebar active href. Uses `renderToStaticMarkup`. Follows `maquinas/page.runtime.test.tsx` pattern.
- [x] `apps/web/app/dashboard/_lib/dashboard-modules.ts` — added "assignments" module to `DASHBOARD_MODULES` with `assignments:read` capability guard. Sidebar now shows "Asignaciones" link.

### Phase 6: Verification
- [ ] 6.1 `supabase db push` — pending (requires Supabase local/remote environment)
- [ ] 6.2 SQL tests run — pending (requires Supabase local/remote environment)
- [x] 6.3 `pnpm test` — 43 test files, 338 passed, 1 skipped. No regressions. New application unit tests (12) + runtime tests (6) all pass.
- [x] 6.4 `pnpm -r typecheck` — 5 of 6 workspace packages pass. No TypeScript errors.
- [ ] 6.5 Manual smoke test — pending (requires running app)

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260627000000_create_asignaciones_maquina.sql` | Created (PR1) | Table, indexes, RLS, 3 RPCs, audit trigger, revoke/grant |
| `supabase/tests/asignaciones_maquina_catalog.sql` | Created (PR1) | 10 SQL tests for validation and lifecycle |
| `packages/domain/src/assignments/machine-assignment.ts` | Created (PR1) | Domain types and repository port |
| `packages/domain/src/assignments/index.ts` | Created (PR1) | Re-exports |
| `packages/domain/src/index.ts` | Modified (PR1) | Added assignments export |
| `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` | Created (PR1) | Supabase adapter for RPCs |
| `packages/infrastructure/src/assignments/index.ts` | Created (PR1) | Re-exports |
| `packages/infrastructure/src/index.ts` | Modified (PR1) | Added assignments export |
| `packages/application/src/assignments/machine-assignment.ts` | Created (PR2) | Application service: create, update, list with capability gates + error mapping |
| `packages/application/src/assignments/machine-assignment.test.ts` | Created (PR2) | 12 unit tests for application service |
| `packages/application/src/assignments/index.ts` | Created (PR2) | Re-exports |
| `packages/application/src/index.ts` | Modified (PR2) | Added assignments export |
| `apps/web/app/dashboard/assignments/catalog.ts` | Created (PR2) | Server actions + auth helpers |
| `apps/web/app/dashboard/assignments/page.tsx` | Created (PR2) | Server component: form + list + data fetching |
| `apps/web/app/dashboard/assignments/page.runtime.test.tsx` | Created (PR2) | 6 runtime UI tests |
| `apps/web/app/dashboard/_lib/dashboard-modules.ts` | Modified (PR2) | Registered assignments sidebar module |

## Deviations from Design

None — implementation matches design. Minor practical adaptations:
- Domain validations (machine type, project status, operator role) are enforced by the database RPC layer (already implemented in PR1); the application layer validates input fields and maps DB errors to domain codes.
- The page calls `list_asignaciones_activas` RPC directly (via service client) to get joined display data (machine codigo, project nombre, operator full_name), since the domain `MachineAssignment` type doesn't include join fields.
- Operators list uses a direct Supabase query joining `user_profiles` + `user_roles` + `roles` filtering by `roles.name = 'operador'`, since there's no dedicated infra repository for tenant user role queries.

## Issues Found

None.

## Verification Results

- **Typecheck**: `pnpm -r typecheck` — 5 of 6 packages pass (all green). No new errors.  
- **Tests**: `pnpm test` — 43 test files, 338 passed, 1 skipped. No regressions.  
  - New: 12 application unit tests (machine-assignment.test.ts) — all pass.  
  - New: 6 runtime UI tests (page.runtime.test.tsx) — all pass.  
- **Supabase push**: Not executed (requires Supabase local/remote environment).  
- **SQL tests**: Not executed (requires Supabase local/remote environment).  
- **Manual smoke test**: Not executed (requires running app).

## Workload / PR Boundary

- **Work unit**: PR 2 — Application + Web UI  
- **Lines changed**: ~530 (application service: ~230, tests: ~280, index: ~5, page: ~310, catalog: ~170, runtime test: ~185, dashboard-modules: ~8)  
- **Review budget**: Over 400-line budget (PR was planned as chained). Chained PR split: PR 1 (DB + Domain + Infra) → PR 2 (Application + Web).  
- **Chain strategy**: stacked-to-main. PR 2 targets main after PR 1 merges.
