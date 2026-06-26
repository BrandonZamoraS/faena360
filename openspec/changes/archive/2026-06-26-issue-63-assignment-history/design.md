# Design: Consultar Asignaciones Activas e Historial por Rol

## Technical Approach

Extender el RPC `list_asignaciones_activas` con filtros opcionales, agregar RPC `list_asignacion_historial` sobre `audit_log`, modificar el trigger `audit_asignaciones_maquina` para incluir `id` en diffs de UPDATE, y exponer un drawer de historial en la tabla de asignaciones. Todo sin nueva tabla ni breaking changes.

## Architecture Decisions

| Decision | Options | Trade-offs | Choice |
|----------|---------|-----------|--------|
| Historial sin tabla dedicada | Reutilizar `audit_log` vs nueva `asignaciones_maquina_historial` | Menor infraestructura, pero query JSONB. Tabla dedicada: duplica patrón, más joins. | `audit_log` con expression index |
| Filtros nulos en RPC | `coalesce(p_proyecto_id, proyecto_id) = proyecto_id` vs `OR p_proyecto_id IS NULL` | `coalesce` evita full scan si el planner no optimiza bien. `OR` es más legible pero puede forzar seqscan. | `coalesce` en WHERE para cada filtro |
| Drawer vs modal | Drawer lateral (detalle) vs modal centrado | Drawer permite scroll largo del timeline sin bloquear contexto de la tabla. | Drawer con `<details>`/`<dialog>` nativo |
| Repository firma extendida | `listActive({tenantId, proyectoId?, maquinaId?})` vs método separado | Un solo método mantiene interfaz simple; argumentos opcionales no rompen callers existentes. | Extender `listActive` con params opcionales |
| Index estrategia | Expression index puro vs partial index con WHERE | Partial index `WHERE action LIKE 'asignacion.%'` reduce tamaño; expression index acelera filtro por assignment. | Partial expression index |

## Data Flow

```
UI /dashboard/assignments
  ├─ filtros → URL searchParams → page.tsx → listActiveAssignmentsWithJoins(tenantId, proyectoId?, maquinaId?)
  └─ "Historial" → server action → listAssignmentHistory(tenantId, assignmentId)

Server action
  → MachineAssignmentService.listAssignmentHistory (valida assignments:read)
    → SupabaseMachineAssignmentRepository.listHistory
      → RPC list_asignacion_historial(p_tenant_id, p_asignacion_id)
        → audit_log (tenant_id + action LIKE 'asignacion.%' + (new_value->>'id')::uuid)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260627000001_assignment_history.sql` | Create | Modifica trigger, crea índices, extiende RPC, crea RPC historial |
| `packages/domain/src/assignments/machine-assignment.ts` | Modify | Agrega `AssignmentHistoryEntry`, `MachineAssignmentHistoryFilters`, extiende `MachineAssignmentRepository` |
| `packages/domain/src/assignments/index.ts` | Modify | Re-exporta nuevos tipos |
| `packages/application/src/assignments/machine-assignment.ts` | Modify | Agrega `listAssignmentHistory` al service |
| `packages/application/src/assignments/machine-assignment.test.ts` | Modify | Tests unitarios para `listAssignmentHistory` y filtros extendidos |
| `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` | Modify | Implementa `listHistory`, extiende `listActive` con filtros opcionales |
| `apps/web/app/dashboard/assignments/page.tsx` | Modify | Agrega dropdowns de filtro + drawer de historial + pasa `readOnly` |
| `apps/web/app/dashboard/assignments/page.runtime.test.tsx` | Modify | Tests de UI: filtros visibles, drawer renderiza, modo solo lectura |
| `apps/web/app/dashboard/assignments/catalog.ts` | Modify | Agrega server action `listAssignmentHistoryAction` |
| `supabase/tests/asignaciones_maquina_catalog.sql` | Modify | Tests SQL: filtros RPC, historial completo, tenant isolation, trigger con id |

## Interfaces / Contracts

### Domain

```typescript
export interface AssignmentHistoryEntry {
  readonly occurred_at: string;
  readonly action: string;
  readonly actor_user_id: string | null;
  readonly old_value: Record<string, unknown> | null;
  readonly new_value: Record<string, unknown> | null;
  readonly source: string;
}

export interface MachineAssignmentHistoryFilters {
  readonly proyectoId?: string | null;
  readonly maquinaId?: string | null;
}

export interface MachineAssignmentRepository {
  listActive(input: {
    readonly tenantId: string;
    readonly proyectoId?: string | null;
    readonly maquinaId?: string | null;
  }): Promise<readonly MachineAssignment[]>;

  listHistory(input: {
    readonly tenantId: string;
    readonly assignmentId: string;
  }): Promise<readonly AssignmentHistoryEntry[]>;
  // ... create, updateStatus unchanged
}
```

### RPC Signatures

```sql
-- Extended
list_asignaciones_activas(
  p_tenant_id uuid,
  p_proyecto_id uuid DEFAULT NULL,
  p_maquina_id uuid DEFAULT NULL
) returns jsonb[]

-- New
list_asignacion_historial(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_asignacion_id uuid
) returns jsonb[]
```

### Server Action

```typescript
export async function listAssignmentHistoryAction(
  assignmentId: string
): Promise<readonly AssignmentHistoryEntry[]>;
```

## Data Model

### Trigger modification

```sql
if TG_OP = 'UPDATE' then
  select jsonb_object_agg(key, value)
    into _old_value
  from jsonb_each(to_jsonb(old))
  where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;
  _old_value := jsonb_set(coalesce(_old_value, '{}'), '{id}', to_jsonb(old.id));

  select jsonb_object_agg(key, value)
    into _new_value
  from jsonb_each(to_jsonb(new))
  where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;
  _new_value := jsonb_set(coalesce(_new_value, '{}'), '{id}', to_jsonb(new.id));
```

### Indexes

```sql
create index idx_asignaciones_tenant_proyecto
  on public.asignaciones_maquina (tenant_id, proyecto_id);

create index idx_asignaciones_tenant_proyecto_estado
  on public.asignaciones_maquina (tenant_id, proyecto_id, estado);

create index idx_audit_log_assignment_id
  on public.audit_log ((new_value->>'id'))
  where action like 'asignacion.%';
```

### RPC `list_asignacion_historial` WHERE clause

```sql
where tenant_id = p_tenant_id
  and action like 'asignacion.%'
  and (new_value->>'id')::uuid = p_asignacion_id
order by occurred_at desc
```

## UI Design

- **Filtros**: Dos `<select>` encima de la tabla (proyecto, máquina). Cambio dispara recarga con `?proyecto_id=X&maquina_id=Y`. `page.tsx` lee `searchParams` y pasa a `listActiveAssignmentsWithJoins`.
- **Drawer**: Botón "Historial" por fila. Abre `<dialog>` nativo o sección desplegable con timeline ordenado `occurred_at DESC`. Muestra: fecha/hora, acción (crear/actualizar/eliminar), actor, campos modificados (diff old→new).
- **Solo lectura**: `canMutate = canCreate || canUpdate`. Si `!canMutate`, se muestra banner "modo lectura" y se ocultan botones de acción. El botón "Historial" siempre visible para `assignments:read`.
- **Estados vacíos**: Timeline sin entradas → "Sin cambios registrados". Filtros sin resultados → "No hay asignaciones activas para los filtros seleccionados."

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `listAssignmentHistory` valida `assignments:read` antes de repository call | Mock repository + capability checker en `machine-assignment.test.ts` |
| Unit | `listActive` con filtros opcionales pasa params al RPC | Mock repository assert en `machine-assignment.test.ts` |
| Runtime | Drawer renderiza timeline; filtros recargan URL params | `renderToStaticMarkup` + string asserts en `page.runtime.test.tsx` |
| SQL | Trigger incluye `id` en UPDATE diff; historial filtra por tenant; índices usados | Extend `asignaciones_maquina_catalog.sql` con `EXPLAIN` y `jsonb` asserts |

## Security Model

| Layer | Validation |
|-------|-----------|
| RPC `list_asignaciones_activas` | `p_tenant_id` en WHERE; RLS deny-all en tabla base |
| RPC `list_asignacion_historial` | `p_tenant_id` + `app_user_has_capability(p_actor_id, p_tenant_id, 'assignments:read')` |
| Service | `capabilityChecker.requireCapability` para `assignments:read` |
| Server action | `getAuthorizedAssignmentsSession` verifica `assignments:read`; redirige si no |
| Repository | Service-role client solo; no acceso directo de frontend a tabla |
| Tenant isolation | `audit_log` tiene RLS por `tenant_id`; RPC fuerza `p_tenant_id` en WHERE |

## Migration Plan

1. **SQL migration** (`20260627000001_assignment_history.sql`):
   - `create or replace function audit_asignaciones_maquina()` — agrega `id` a `_old_value`/`_new_value` en UPDATE.
   - `create or replace function list_asignaciones_activas(...)` — agrega `p_proyecto_id`, `p_maquina_id` con `coalesce`.
   - `create function list_asignacion_historial(...)` — nuevo RPC.
   - Crear 3 índices.
   - Revoke/grant execute.
2. **Domain/Application** — agregar tipos y métodos.
3. **Infrastructure** — implementar métodos en repository.
4. **Web** — agregar filtros, drawer, server action.
5. **Tests** — SQL + unit + runtime.

## Open Questions

- [ ] Drawer nativo `<dialog>` o componente condicional inline? El proyecto no usa librería de UI; `<dialog>` es suficiente.
- [ ] Los filtros deben persistir en URL (searchParams) o en estado local? **Decisión**: URL para shareability y back button.
