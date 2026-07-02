# Proposal: Cerrar asignaciones activas al finalizar proyecto o subproyecto

## Intent

Al finalizar un proyecto o subproyecto, sus asignaciones de máquina activas deben cerrarse automáticamente con estado `cerrada_por_finalizacion`. Actualmente el sistema no ejecuta este cierre, dejando asignaciones huérfanas que rompen la coherencia operativa (subfase 1.3).

## Scope

### In Scope
- Cerrar automáticamente `asignaciones_maquina` activas al invocar `finish_proyecto`
- Cerrar automáticamente `asignaciones_maquina` activas al invocar `finish_subproyecto`
- Registrar cada cierre en `audit_log` con `source = 'system'`
- Retornar conteo de asignaciones cerradas para feedback en UI
- Verificación con tests SQL

### Out of Scope
- Cierre manual de asignaciones (ya existe vía `update_asignacion`)
- Reactivación de asignaciones al reabrir proyecto
- Reasignación automática de máquinas
- Cálculo de jornadas, partes diarios o liquidaciones

## Capabilities

### New Capabilities
- `proyectos-finalizacion`: Project/subproject finalization MUST close active machine assignments atomically within the finish transaction. The finish RPCs MUST accept an optional `p_close_assignments` flag (default true). Closed assignments MUST transition to `cerrada_por_finalizacion` with `source = 'system'` in audit.

### Modified Capabilities
None — no existing spec covers project/subproject lifecycle or machine assignment closure.

## Approach

**Helper PL/pgSQL functions** (Approach #2 from exploration) — sigue el patrón existente de `invalidate_open_jornadas_for_proyecto`:

1. Crear `close_assignments_for_project(p_actor_id, p_tenant_id, p_project_id)` y `close_assignments_for_subproject(p_actor_id, p_tenant_id, p_subproject_id)` como funciones helper
2. Cada helper hace `UPDATE asignaciones_maquina SET estado = 'cerrada_por_finalizacion', fecha_fin = now() WHERE estado = 'activa'`
3. Invocar desde `finish_proyecto` (cierra asignaciones directas + subproyectos) y `finish_subproyecto`
4. Registrar en `audit_log` por fila actualizada mediante el trigger `audit_asignaciones_maquina` ya existente, con context indicando source = 'system'
5. Retornar `INT` (count) para feedback en UI

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/20260624000000_create_proyectos.sql` | Modified | Agregar llamada a `close_assignments_for_project` en `finish_proyecto` |
| `supabase/migrations/20260626000000_create_subproyectos.sql` | Modified | Agregar llamada a `close_assignments_for_subproject` en `finish_subproyecto` |
| Nueva migration SQL | New | Crear `close_assignments_for_project` y `close_assignments_for_subproject` |
| `supabase/tests/asignaciones_maquina_catalog.sql` | Modified | Agregar tests de cierre automático |
| `apps/web/app/dashboard/projects/` | Modified | Mostrar feedback "Se cerraron N asignaciones" |
| `apps/web/app/dashboard/subprojects/` | Modified | Mostrar feedback "Se cerraron N asignaciones" |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| UPDATE masivo lento en proyectos con muchas asignaciones | Low | Índice `idx_asignaciones_tenant_proyecto_estado` ya existe; filtrar solo `estado = 'activa'` |
| Condición de carrera con retiro manual simultáneo | Low | UPDATE atómico por fila; el que llega segundo no afecta filas ya cambiadas |
| Cierre de asignaciones de subproyectos incorrectos al finalizar proyecto padre | Low | Usar subquery con `proyecto_id IN (SELECT id FROM subproyectos WHERE proyecto_id = p_project_id)` |

## Rollback Plan

1. Quitar la llamada a los helpers de `finish_proyecto`/`finish_subproyecto` en las migrations
2. Las asignaciones cerradas no se revierten automáticamente — requiere UPDATE manual o script de reversión si fuese necesario
3. El estado `cerrada_por_finalizacion` ya existe en el schema; no requiere rollback de schema

## Dependencies

- Issue #62, #63, #20 (proyectos, subproyectos, asignaciones_maquina base)
- `audit_asignaciones_maquina` trigger ya existente para registro de auditoría

## Success Criteria

- [ ] Finalizar un proyecto cierra sus asignaciones activas → estado `cerrada_por_finalizacion`
- [ ] Finalizar un subproyecto cierra sus asignaciones activas → estado `cerrada_por_finalizacion`
- [ ] El `audit_log` registra cada cierre con `source = 'system'`
- [ ] No se cierran asignaciones fuera del proyecto/subproyecto finalizado
- [ ] Los helpers retornan el conteo correcto de asignaciones cerradas
- [ ] Tests SQL pasan para ambos escenarios (proyecto y subproyecto)
