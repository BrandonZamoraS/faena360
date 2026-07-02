# Design: Cerrar asignaciones activas al finalizar proyecto o subproyecto

## Technical Approach

Add PL/pgSQL helpers that UPDATE `asignaciones_maquina` to `cerrada_por_finalizacion`, scoped by project or subproject. Invoke them atomically inside `finish_proyecto` and `finish_subproyecto`. Both RPCs gain an optional `p_close_assignments boolean default true` and return `INT` (closed count; `-1` = not found). The count propagates through repository → service → UI for feedback.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Helper vs inline SQL | Inline in RPC | Less reusable, harder to test in isolation | **Helper functions** — follow existing `invalidate_open_jornadas_for_*` pattern |
| RPC return type | `boolean` / composite / `int` | Composite adds TS struct churn; `boolean` can't return count | **`int`** — `-1` for not-found preserves old `false` semantic with minimal stack changes |
| `p_close_assignments` default | `true` / `false` / no flag | No flag removes control; `false` is a silent breaking change | **`true`** — new behavior is automatic; flag is an escape hatch |
| Audit mechanism | Reuse trigger / manual `INSERT` | Manual INSERT duplicates schema logic and risks drift | **Reuse `audit_asignaciones_maquina`** — helper sets `app.audit_source = 'system'` before UPDATE |
| `updated_by` on auto-close | Set to actor / leave null / omit | Actor is `user_profiles.id`, column references `auth.users.id`; requires extra lookup | **Omit** — consistent with `update_asignacion` which does not set `updated_by` |

## Data Flow

```
UI finish action
  → finishProjectAction / finishSubprojectAction
    → CatalogService.finish()
      → SupabaseRepository.finish()
        → RPC finish_proyecto / finish_subproyecto
          → close_assignments_for_project / _subproject
            → UPDATE asignaciones_maquina
              → trigger audit_asignaciones_maquina (source = 'system')
          → UPDATE proyectos / subproyectos
            → trigger audit_proyectos / audit_subproyectos (source = 'web')
      ← returns INT count
    ← MutateProjectOutcome { ok, closedAssignmentsCount? }
  ← revalidatePath + display count
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260630000000_create_close_assignment_helpers.sql` | Create | Helpers + `idx_asignaciones_tenant_subproyecto_estado` |
| `supabase/migrations/20260624000000_create_proyectos.sql` | Modify | Add `p_close_assignments`, call helper, return `INT`, update grants |
| `supabase/migrations/20260626000000_create_subproyectos.sql` | Modify | Add `p_close_assignments`, call helper, return `INT`, update grants |
| `supabase/tests/asignaciones_maquina_catalog.sql` | Modify | Add auto-close SQL tests |
| `packages/domain/src/projects/project-catalog.ts` | Modify | `FinishProjectInput.closeAssignments?`; `MutateProjectOutcome.closedAssignmentsCount?` |
| `packages/domain/src/subprojects/subproject-catalog.ts` | Modify | `FinishSubprojectInput.closeAssignments?`; `MutateSubprojectOutcome.closedAssignmentsCount?` |
| `packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.ts` | Modify | `finish()` returns `Promise<number>` |
| `packages/infrastructure/src/subprojects/SupabaseSubprojectCatalogRepository.ts` | Modify | `finish()` returns `Promise<number>` |
| `packages/application/src/projects/project-catalog.ts` | Modify | Map `number` to outcome; include count on success |
| `packages/application/src/subprojects/subproject-catalog.ts` | Modify | Map `number` to outcome; include count on success |
| `apps/web/app/dashboard/proyectos/page.tsx` | Modify | Display `closedAssignmentsCount` feedback after finish |
| `apps/web/app/dashboard/subprojects/page.tsx` | Modify | Display `closedAssignmentsCount` feedback after finish |

## Interfaces / Contracts

**SQL helpers**
```sql
create or replace function public.close_assignments_for_project(
  p_tenant_id uuid, p_project_id uuid
) returns int;

create or replace function public.close_assignments_for_subproject(
  p_tenant_id uuid, p_subproject_id uuid
) returns int;
```

**Modified RPCs**
```sql
create or replace function public.finish_proyecto(
  p_actor_id uuid, p_audit_source text, p_tenant_id uuid,
  p_project_id uuid, p_force bool default false,
  p_reason text default null, p_close_assignments bool default true
) returns int;  -- -1 = not found, >=0 = closed count

create or replace function public.finish_subproyecto(
  p_actor_id uuid, p_audit_source text, p_tenant_id uuid,
  p_subproject_id uuid, p_force bool default false,
  p_reason text default null, p_close_assignments bool default true
) returns int;
```

**Helper core pattern**
```sql
perform set_config('app.audit_source', 'system', true);
update public.asignaciones_maquina
set estado = 'cerrada_por_finalizacion', fecha_fin = now()
where tenant_id = p_tenant_id and estado = 'activa'
  and (proyecto_id = p_project_id
       or subproyecto_id in (
         select id from public.subproyectos
         where tenant_id = p_tenant_id and proyecto_id = p_project_id));
get diagnostics v_count = row_count;
return v_count;
```

**Domain types**
```ts
interface FinishProjectInput {
  readonly projectId: string;
  readonly force?: boolean;
  readonly reason?: string;
  readonly closeAssignments?: boolean;
}
interface MutateProjectOutcome {
  readonly ok: boolean;
  readonly code?: string;
  readonly closedAssignmentsCount?: number;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| SQL | Scope isolation | `psql` test script: finish project A, assert project B assignments remain `activa` |
| SQL | Audit source = `system` | Query `audit_log` after finish; assert `source = 'system'` on `asignacion.update` rows |
| SQL | `p_close_assignments = false` | Assert returned count = 0 and no state changes |
| SQL | Only `activa` rows affected | Seed 1 active + 2 closed assignments; assert only the active one transitions |
| SQL | Race with manual withdrawal | Concurrent transaction sets `retirada_del_proyecto`; finish helper no-op, no error |
| Unit (TS) | Repository returns count | Mock `supabase.rpc` returning `3`; assert `finish()` resolves to `3` |
| Unit (TS) | Service maps `-1` to failure | Mock repo returning `-1`; assert `{ ok: false, code: 'missing_project' }` |
| Unit (TS) | Service exposes count on success | Mock repo returning `2`; assert outcome includes `closedAssignmentsCount: 2` |

## Migration / Rollout

**Deploy order**: The RPC return type changes from `boolean` → `int`. Old TS code doing `Boolean(response.data)` would misinterpret `0` as failure. Deploy the TS stack changes first (code reads `number`), then run the DB migrations.

**Rollback**: Remove helper calls from the RPC migrations. Already-closed assignments do not revert automatically; a manual UPDATE or one-off script is required if reversal is needed. The `cerrada_por_finalizacion` value already exists in the check constraint, so no schema rollback is needed.

**Data migration**: None.

## Decisions Resolved

### Subprojects already finalized
**Decision**: YES — `close_assignments_for_project` closes assignments of ALL subprojects under the project, regardless of subproject status. This is defensive cleanup that fixes any previously orphaned active assignments.

### UI feedback mechanism
**Decision**: Query-param flash (`?closed=N`). The server action redirects to `/dashboard/proyectos?closed=3` (or subprojects equivalent) and the page reads `searchParams.closed` to display a toast. Minimal change, consistent with existing `revalidatePath` + server action pattern.
