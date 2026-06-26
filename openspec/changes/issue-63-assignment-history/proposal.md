# Proposal: Consultar Asignaciones Activas e Historial por Rol

## Intent

Admin y supervisor necesitan consultar asignaciones activas con filtros (proyecto/máquina) y ver el historial de cambios de estado y tarifa por asignación. Hoy `list_asignaciones_activas` no acepta filtros opcionales y no hay forma de consultar cambios históricos vinculados a una asignación específica.

## Scope

### In Scope
- Filtros opcionales `p_proyecto_id`, `p_maquina_id` en `list_asignaciones_activas`
- RPC `list_asignacion_historial` que devuelve cambios desde `audit_log`
- Modificar trigger `audit_asignaciones_maquina` para incluir `id` en el diff JSONB (requerido para filtrar UPDATEs por assignment)
- Índices: `(tenant_id, proyecto_id)`, `(tenant_id, proyecto_id, estado)` en `asignaciones_maquina`; expression index en `audit_log((new_value->>'id'))`
- UI: filtros en listado + drawer de historial con timeline
- `assignments:read` para supervisor (ya existe en bootstrap)

### Out of Scope
- Modificar schema de `audit_log` (sin columna `target_entity_id`)
- Tabla de historial dedicada (`asignaciones_maquina_historial`)
- Edición de tarifa aplicada post-creación
- UI de creación/edición para supervisor

## Capabilities

### New Capabilities
- `assignment-history`: consulta de cambios históricos por asignación vía `audit_log`, tenant-scoped

### Modified Capabilities
- `machine-assignments`: `list_asignaciones_activas` acepta filtros opcionales `p_proyecto_id` y `p_maquina_id`

## Approach

**Historial sin nueva tabla**: el trigger `audit_asignaciones_maquina` captura diffs en `audit_log` con action `asignacion.create/update/delete`. El problema: para UPDATEs el diff solo incluye campos modificados (sin `id`), impidiendo filtrar por assignment. **Solución**: modificar el trigger para siempre incluir `id` en `old_value` y `new_value`. Luego, RPC `list_asignacion_historial` consulta `audit_log` por `tenant_id + action LIKE 'asignacion.%' + (new_value->>'id')::uuid = p_asignacion_id`, ordenado por `occurred_at DESC`.

**Por qué no `target_entity_id` ni tabla dedicada**: agregar columna a `audit_log` requiere migración sobre tabla compartida con riesgo de bloqueo. Tabla dedicada duplica infraestructura de auditoría. El approach elegido es mínimamente invasivo, usa el audit_log existente, y escala para el volumen esperado (≤10 entradas por asignación).

**Filtros**: `list_asignaciones_activas` extiende firma con `p_proyecto_id uuid DEFAULT NULL` y `p_maquina_id uuid DEFAULT NULL`. WHERE usa `coalesce` para ignorar filtros nulos.

**UI**: server component `/dashboard/assignments` agrega dropdowns de filtro + botón "Historial" por fila que abre drawer con timeline de `list_asignacion_historial`. Supervisor ve todo en modo solo lectura.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*.sql` | Modified+New | Trigger fix, RPCs extendidos/nuevos, 3 índices |
| `packages/domain/src/assignments/` | Modified | `AssignmentHistoryEntry` DTO |
| `packages/application/src/assignments/` | Modified | `listAssignmentHistory` use case |
| `apps/web/app/dashboard/assignments/` | Modified | Filtros + drawer historial |
| `supabase/tests/*.sql` | New | Tests de filtros e historial |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| UPDATE sin id en diff → historial incompleto | Low | Trigger modificado siempre incluye `id` en JSONB |
| JSONB query en audit_log lenta a escala | Low | Expression index; volumen ≤10 entradas por asignación |
| Supervisor ve datos de otro tenant | Low | RPC fuerza `p_tenant_id`; RLS deny-all en tabla base |

## Rollback Plan

Revertir migration con `supabase migration repair`. Remover filtros y drawer del frontend. Trigger modificado es backward-compatible: solo agrega campo `id` al JSONB diff.

## Dependencies

- Issue #62 mergeado en `development` (tabla `asignaciones_maquina`, RPCs base, audit trigger)
- `assignments:read` ya en `default-role-bootstrap.ts` para admin y supervisor

## Success Criteria

- [ ] `list_asignaciones_activas` filtra por `proyecto_id` y `maquina_id`
- [ ] `list_asignacion_historial` devuelve timeline completo (creación + cambios estado/tarifa)
- [ ] Supervisor ve listado e historial sin botones de acción
- [ ] Usuario sin `assignments:read` → 403
- [ ] Tenant isolation: sin cross-tenant leakage en historial ni listado
- [ ] `pnpm test` + `pnpm -r typecheck` pasan limpios
