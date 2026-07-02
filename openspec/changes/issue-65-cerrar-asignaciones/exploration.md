## Exploration: Cerrar asignaciones activas al finalizar proyecto o subproyecto

### Current State

El sistema actualmente **no cierra automáticamente** las asignaciones activas cuando un proyecto o subproyecto se finaliza. El estado `cerrada_por_finalizacion` existe en el modelo de datos (`asignaciones_maquina.estado`) y el RPC `update_asignacion` soporta la transición a ese estado (`fecha_fin = now()` se setea automáticamente), pero solo se usa desde la UI manual (vía `updateAssignmentStatus` con capability `assignments:update`).

El flujo de finalización actual (`finish_proyecto`, `finish_subproyecto`) ya maneja:
- Validación de capability (`projects:finish` / `subprojects:finish`)
- Conteo y anulación de jornadas abiertas (opcional con `force=true`)
- Finalización de subproyectos hijos cuando se finaliza un proyecto padre
- Seteo de `fecha_finalizacion`

Pero **no consulta ni modifica** la tabla `asignaciones_maquina`.

### Affected Areas

- `supabase/migrations/20260624000000_create_proyectos.sql` — Modificar `finish_proyecto` RPC para cerrar asignaciones activas del proyecto y sus subproyectos
- `supabase/migrations/20260626000000_create_subproyectos.sql` — Modificar `finish_subproyecto` RPC para cerrar asignaciones activas del subproyecto
- `supabase/migrations/20260627000003_amend_update_asignacion_withdraw.sql` — El `update_asignacion` actual ya soporta `cerrada_por_finalizacion` y valida capability `assignments:update`; no requiere cambios de validación
- `packages/application/src/assignments/machine-assignment.ts` — Posible nuevo método `closeAssignmentsForProject` / `closeAssignmentsForSubproject`, o reuso de `updateAssignmentStatus`
- `packages/domain/src/assignments/machine-assignment.ts` — Posible nueva error code o nuevo método en `MachineAssignmentRepository`
- `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` — Posible nuevo RPC batch o reuso de `updateStatus`
- `apps/web/app/dashboard/projects/` — Feedback en UI al finalizar proyecto cuando hay asignaciones afectadas
- `apps/web/app/dashboard/subprojects/` — Feedback en UI al finalizar subproyecto cuando hay asignaciones afectadas
- `supabase/tests/asignaciones_maquina_catalog.sql` — Nuevos tests SQL para verificar cierre automático
- `packages/application/src/assignments/machine-assignment.test.ts` — Nuevos tests unitarios

### Approaches

1. **Lógica dentro de los RPCs existentes `finish_proyecto` / `finish_subproyecto` (enfoque monolítico SQL)**
   - Modificar los RPCs PL/pgSQL para que hagan un `UPDATE asignaciones_maquina SET estado = 'cerrada_por_finalizacion', fecha_fin = now()` como parte de la transacción de finalización
   - Pros: Transaccional (todo o nada), sin capas intermedias, consistente con el patrón existente de `invalidate_open_jornadas`
   - Cons: Mezcla lógica de proyectos con lógica de asignaciones; dificulta testing unitario; el RPC ya es grande y complejo
   - Effort: Low

2. **Helper function SQL separada (ej. `close_project_assignments`) invocada desde `finish_proyecto`/`finish_subproyecto`**
   - Crear una función helper `public.close_assignments_for_project(p_tenant_id, p_project_id)` y otra para subproyectos, con capability gate interno o sin él (pues el RPC caller ya validó capability)
   - Reutilizar el patrón de `invalidate_open_jornadas_for_proyecto` pero para asignaciones
   - Pros: Separa responsabilidades, reutilizable, testeable vía SQL tests, mantiene transaccionalidad
   - Cons: Sigue siendo lógica de BD; requiere nueva migration
   - Effort: Low

3. **Application layer service que cierra asignaciones desde TypeScript**
   - Agregar método `closeAssignmentsForProject` en `MachineAssignmentService`, llamado desde el server action de finalizar proyecto
   - Pros: Testing unitario en Vitest, separación clara de capas, sigue el patrón hexagonal
   - Cons: No es transaccional (el UPDATE del estado del proyecto y de las asignaciones ocurren en llamadas separadas a Supabase); riesgo de consistencia eventual; requiere modificar el flujo de finalización en la capa web
   - Effort: High

4. **Database trigger `AFTER UPDATE OF estado ON proyectos`**
   - Crear un trigger que cuando `proyectos.estado` cambie a `finalizado`, haga el UPDATE masivo de asignaciones
   - Pros: Totalmente automático, no requiere cambios en RPCs existentes, garantizado ante cualquier camino de finalización
   - Cons: El trigger no tiene acceso al `app.current_actor_id`/`app.audit_source` del RPC caller (el trigger ve `OLD`/`NEW` pero no el context de sesión); difícil de auditar correctamente; lógica oculta que puede sorprender
   - Effort: Medium

### Recommendation

**Enfoque #2 (Helper function SQL separada)** — Es el que mejor balancea:
- Consistencia con el patrón existente (`invalidate_open_jornadas_for_proyecto` es un helper similar)
- Transaccionalidad (todo en la misma transacción del RPC)
- Testeabilidad (SQL tests directos contra la helper)
- Separación de concerns (la helper se ocupa SOLO de asignaciones)

El flujo sería:
1. Crear `public.close_assignments_for_project(p_actor_id, p_tenant_id, p_project_id)` y `public.close_assignments_for_subproject(p_actor_id, p_tenant_id, p_subproject_id)`
2. Modificar `finish_proyecto` para invocar `close_assignments_for_project` al final, ANTES del UPDATE del estado del proyecto
3. Modificar `finish_subproyecto` para invocar `close_assignments_for_subproject` al final
4. `finish_proyecto` también debe cerrar asignaciones de subproyectos (ya que el issue dice "asignaciones activas relacionadas")
5. Registrar en audit_log vía `set_config` (cada helper setea su propio audit context)
6. Retornar la cantidad de asignaciones cerradas para feedback en UI (similar a `invalidate_open_jornadas_for_proyecto`)

### Risks

- **Riesgo de rendimiento**: Si un proyecto tiene muchas asignaciones activas, el UPDATE masivo debe ser eficiente. El índice compuesto `idx_asignaciones_tenant_proyecto_estado` ya cubre `(tenant_id, proyecto_id, estado)`, lo que debería hacer el UPDATE rápido.
- **Riesgo de cierre incorrecto**: Asegurar que solo se cierren asignaciones con `estado = 'activa'` — no deben cerrarse asignaciones ya retiradas o bloqueadas. La query debe filtrar por `WHERE estado = 'activa'`.
- **Riesgo de subproyectos**: Al finalizar un proyecto, hay que cerrar tanto las asignaciones directas del proyecto (sin subproyecto) como las de todos sus subproyectos. El helper debe manejar ambos casos.
- **Riesgo de conflicto con `update_asignacion`**: Si alguien intenta retirar una asignación al mismo tiempo que se finaliza el proyecto, podría haber una condición de carrera. Sin embargo, el UPDATE en el RPC es atómico por fila.
- **Riesgo de audit trail**: Las asignaciones cerradas automáticamente deben quedar registradas en `audit_log` con source = 'system' (o similar), para distinguir del cierre manual.

### Ready for Proposal

Yes — el análisis es suficiente para proceder con la fase de proposal. Queda una pregunta abierta para clarificar en el proposal:

- **Pregunta**: ¿El helper debe retornar el count de asignaciones cerradas para mostrar feedback en UI, similar a cómo `invalidate_open_jornadas_for_proyecto` retorna el número de jornadas anuladas? Esto permitiría al administrador ver "Se cerraron N asignaciones activas" al finalizar.
