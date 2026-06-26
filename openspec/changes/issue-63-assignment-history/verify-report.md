## Verification Report

**Change**: issue-63-assignment-history
**Version**: N/A (spec v1)
**Mode**: Standard (Strict TDD: false)

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 24 |
| Tasks complete | 24 |
| Tasks incomplete | 0 |

---

### Build & Tests Execution

**Build**: ❌ Failed
```text
pnpm -r build
  apps/web build: next build
  Turbopack build failed with 5 errors in ./apps/web/app/dashboard/assignments/catalog.ts
  - Inline "use server" annotated Server Actions in Client Components (x3)
  - Importing next/headers into a React Client Component module
  - Importing next/cache (revalidatePath) into a React Client Component module
  Root cause: history-drawer.tsx ("use client") imports listAssignmentHistoryAction from catalog.ts,
  which mixes inline Server Actions with server-only APIs (next/headers, next/cache).
  Next.js 16 + Turbopack treats the entire catalog.ts module as a Client Component via the import graph.
```

**Tests**: ✅ 376 passed / ❌ 0 failed / ⚠️ 1 skipped
```text
pnpm test (vitest run)
  - packages/application/src/assignments/machine-assignment.test.ts: 21 passed
  - apps/web/app/dashboard/assignments/page.runtime.test.tsx: 10 passed
  - Total: 376 passed, 1 skipped, 0 failed
```

**Typecheck**: ✅ Passed (5/5 packages)
```text
pnpm -r typecheck
  packages/domain: Done
  packages/shared: Done
  packages/application: Done
  packages/infrastructure: Done
  apps/web: Done
```

**Lint**: ✅ Passed
```text
pnpm -r lint
  apps/web lint: Done
```

**Format**: ⚠️ Below (global repo drift)
```text
pnpm format:check
  160 files with formatting issues (repo-wide CRLF/LF drift on Windows)
  Files changed by this PR are also flagged, but manual inspection shows the delta is line-ending only.
```

**Coverage**: ➖ Not available (no coverage report generated)

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| **R1** `list_asignacion_historial` devuelve timeline | Timeline completo (create + update) | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 12 | ✅ COMPLIANT (code reviewed; SQL not executed locally) |
| **R1** `list_asignacion_historial` sin updates | Solo create entry | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 12 | ✅ COMPLIANT (code reviewed) |
| **R1** Asignación inexistente | Array vacío | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 13 | ✅ COMPLIANT (code reviewed) |
| **R1** Cross-tenant | Array vacío si p_tenant_id no matchea | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 14 | ✅ COMPLIANT (code reviewed) |
| **R2** Trigger incluye `id` en UPDATE diffs | UPDATE old_value/new_value contienen `id` | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 11 | ✅ COMPLIANT (code reviewed) |
| **R3** Expression index `idx_audit_log_assignment_id` | Index exists in migration | Static inspection | ✅ COMPLIANT |
| **R4** Solo `assignments:read` accede al historial | Con capability: ok; Sin capability: 42501 | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 15 | ✅ COMPLIANT (code reviewed) |
| **R4** Capability check en service | `CapabilityDeniedError` thrown | `machine-assignment.test.ts` > "rejects listAssignmentHistory without assignments:read" | ✅ COMPLIANT |
| **MR1** Filtros en `list_asignaciones_activas` | Sin filtros: backward-compatible | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 16/17 | ✅ COMPLIANT (code reviewed) |
| **MR1** Filtros por proyecto | 2 en A, 1 en B → 2 entradas | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 16 | ✅ COMPLIANT (code reviewed) |
| **MR1** Filtros por máquina | X activa, Y sin → 1 entrada | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 17 | ✅ COMPLIANT (code reviewed) |
| **MR1** Ambos filtros | Intersección | `supabase/tests/asignaciones_maquina_catalog.sql` TEST 16/17 | ✅ COMPLIANT (code reviewed) |
| **MR2** Nuevos índices compuestos | `idx_asignaciones_tenant_proyecto`, `idx_asignaciones_tenant_proyecto_estado` | Static inspection | ✅ COMPLIANT |
| **MR3** UI con filtros | Dropdowns proyecto/máquina recargan vía URL | `page.runtime.test.tsx` > "renders filter dropdowns" | ✅ COMPLIANT |
| **MR3** Drawer de historial | Botón "Historial" por fila abre timeline | `page.runtime.test.tsx` > "renders Historial button per row" | ✅ COMPLIANT |
| **MR3** Modo solo lectura supervisor | Ve filtros + listado + Historial; NO ve formulario ni acciones | `page.runtime.test.tsx` > "read-only banner for supervisor" | ✅ COMPLIANT |
| **MR3** Redirect sin capability | Usuario sin `assignments:read` → `/dashboard` | `catalog.ts` static inspection + existing guard | ✅ COMPLIANT |
| **MR3** Estados vacíos diferenciados | Con filtros: "No hay asignaciones activas para los filtros seleccionados." | `page.runtime.test.tsx` > "differentiated empty state" | ✅ COMPLIANT |

**Compliance summary**: 19/19 scenarios compliant (on code review + unit/runtime test basis)

---

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Trigger incluye `id` en UPDATE diffs | ✅ Implemented | `jsonb_set(coalesce(_old_value, '{}'), '{id}', to_jsonb(old.id))` in migration |
| RPC `list_asignaciones_activas` firma extendida | ✅ Implemented | `p_proyecto_id uuid DEFAULT NULL, p_maquina_id uuid DEFAULT NULL` |
| RPC `list_asignacion_historial` security definer | ✅ Implemented | `security definer` present; capability check via `app_user_has_capability()` |
| Domain types `AssignmentHistoryEntry` / `MachineAssignmentHistoryFilters` | ✅ Implemented | Added to `packages/domain/src/assignments/machine-assignment.ts` |
| Application service capability guard | ✅ Implemented | `listAssignmentHistory` calls `requireCapability('assignments:read')` |
| Repository `listHistory` + `listActive` extendido | ✅ Implemented | `SupabaseMachineAssignmentRepository` implements both |
| Server action `listAssignmentHistoryAction` | ✅ Implemented | In `apps/web/app/dashboard/assignments/catalog.ts` |
| UI filtros + drawer + modo solo lectura | ✅ Implemented | `filters.tsx`, `history-drawer.tsx`, `page.tsx` |
| Tenant isolation en RPCs | ✅ Implemented | `p_tenant_id` enforced in `WHERE` clauses of both RPCs |
| Index `idx_audit_log_assignment_id` | ✅ Implemented | Partial expression index with `WHERE action like 'asignacion.%'` |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Historial sin tabla dedicada (reutilizar `audit_log`) | ✅ Yes | `list_asignacion_historial` queries `audit_log` directly |
| Filtros nulos en RPC via `coalesce` | ✅ Yes | `coalesce(p_proyecto_id, a.proyecto_id) = a.proyecto_id` |
| Drawer vs modal | ✅ Yes | State-controlled overlay drawer in `history-drawer.tsx` |
| Repository firma extendida | ✅ Yes | `listActive` accepts optional `proyectoId`/`maquinaId` |
| Partial expression index | ✅ Yes | `idx_audit_log_assignment_id` is partial + expression |
| Filters persist in URL (searchParams) | ✅ Yes | `page.tsx` reads `searchParams`, `filters.tsx` submits via `method="get"` |

---

### Issues Found

**CRITICAL**:
1. **Next.js build failure: Client Component imports Server Action module**
   - `history-drawer.tsx` ("use client") imports `listAssignmentHistoryAction` from `catalog.ts`.
   - `catalog.ts` contains inline `"use server"` annotations and server-only imports (`next/headers`, `next/cache`).
   - Next.js 16 + Turbopack treats `catalog.ts` as a Client Component in this import graph, causing 5 build errors.
   - **Impact**: Production build is broken. The feature cannot be deployed.
   - **Fix direction**: Move `listAssignmentHistoryAction` (and the other server actions) to a separate file with `"use server"` at the top (e.g., `actions.ts`), or pass the action down from the Server Component via props.

**WARNING**:
1. **SQL tests not executed in verification environment**
   - Docker Desktop was unavailable; `supabase/tests/asignaciones_maquina_catalog.sql` could not be run locally.
   - Tests were reviewed statically and appear correct, but runtime validation is missing.
   - **Mitigation**: SQL tests passed per apply-progress log; recommend re-running in CI before merge.

2. **Task 4.1 unit-test gap for `listActive` optional filters**
   - Task 4.1 states: "verify `listActive` passes optional filters" in unit tests.
   - The service `listActiveAssignments` does not accept filter parameters (design decision); filters are applied at the web/page layer via `listActiveAssignmentsWithJoins`.
   - No unit test verifies that the repository receives `proyectoId`/`maquinaId`.
   - **Mitigation**: Covered by SQL tests 16/17, but unit-test layer has a small gap.

**SUGGESTION**:
1. **Format check noise on Windows**
   - `pnpm format:check` flags 160 files due to CRLF/LF line-ending drift.
   - This makes it hard to distinguish real formatting issues from environment noise.
   - **Recommendation**: Add `endOfLine: "auto"` to `.prettierrc` or normalize line endings in CI.

2. **PR description vs actual PR number mismatch in apply-progress**
   - Apply-progress references PR #87, but the consolidated PR is #88.
   - This is documentation-only and does not affect correctness.

---

### Verdict

**FAIL**

The implementation fully satisfies the functional spec, design decisions, and task list on a code-review basis. Unit and runtime tests pass. However, the **Next.js production build is broken** because `history-drawer.tsx` (a Client Component) imports a module (`catalog.ts`) that mixes inline Server Actions with server-only APIs. This is a CRITICAL blocker that must be fixed before merge.

Once the build error is resolved (by isolating server actions into their own module), the change should be re-verified with `pnpm -r build` and the PR checks should be re-run.
