# Proposal: Asignación Activa Máquina-Proyecto-Operador

## Intent

Permitir que un administrador asigne una máquina de tipo `por_tiempo` a un proyecto/subproyecto con un operador y una tarifa real. Solo puede existir una asignación activa por máquina. La tarifa sugerida del catálogo es default, pero se persiste `tarifa_aplicada` como valor contractual inalterable.

## Scope

### In Scope
- Tabla `public.asignaciones_maquina` con columna `estado` (`activa`, `retirada_del_proyecto`, `cerrada_por_finalizacion`, `bloqueada_por_conflicto`)
- Índice único parcial: solo una asignación `activa` por máquina dentro del mismo tenant
- FK a `maquinas`, `proyectos`, `subproyectos`, `tenant_users` (operador)
- RPC `create_asignacion` (security definer) con capability gate `assignments:create` — solo admin
- RPC `update_asignacion` (estado/retiro/cierre) con capability gate `assignments:update`
- Validaciones de negocio: máquina debe ser `por_tiempo` y estar `activa`, proyecto debe estar `activo`, operador debe tener rol `operador` en el tenant
- UI: form `/dashboard/assignments/new` — admin selecciona máquina, proyecto/subproyecto, operador; tarifa precargada con sugerida, editable
- Tests SQL (unique parcial, tenant isolation, validaciones) + unit (use cases) + runtime UI (permisos)

### Out of Scope
- Asignación de máquinas tipo `acarreo` (no son por tiempo)
- Cierre automático al finalizar proyecto (requiere trigger/evento futuro; se documenta como riesgo)
- Bloqueo automático por conflicto (estado `bloqueada_por_conflicto` queda como placeholder)
- Historial de asignaciones (MVP: ocultar en vez de borrar; el audit trigger captura cambios)
- Edición de tarifa aplicada post-creación
- UI para supervisor/operador (solo admin crea; lectura futura)

## Capabilities

### New Capabilities
- `machine-assignments`: ciclo de vida de asignaciones de máquina a proyecto con operador, tenant isolation, índice único parcial, y capability gates por acción

### Modified Capabilities
- None — capabilities `assignments:read`/`create`/`update`/`withdraw` ya existen en el catálogo global y están asignadas al rol administrador vía `default-role-bootstrap.ts`

## Approach

Arquitectura hexagonal siguiendo patrón establecido (máquinas, proyectos, fuel-types):

1. **Migration SQL**: tabla `asignaciones_maquina` → índice único parcial `(tenant_id, maquina_id) WHERE estado = 'activa'` → RPCs security definer con capability gate → RLS deny-all → audit trigger
2. **Domain**: DTOs (`MachineAssignment`, `CreateAssignmentInput`, `AssignmentErrorCode`) + port `MachineAssignmentRepository`
3. **Application**: `createAssignment`, `updateAssignmentStatus`, `listActiveAssignments` — cada uno recibe `capabilities` + `tenant_id` + `userId`
4. **Infrastructure**: `SupabaseMachineAssignmentRepository` — service-role client invoca RPCs; filtro `tenant_id` forzado en toda query
5. **Web**: `apps/web/app/dashboard/assignments/` — server component + server actions con capability gate

Patrón de outcome: `{ ok, code }` — sin excepciones para flujos de negocio. Validaciones de dominio corren en application layer ANTES de delegar al repositorio.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*.sql` | New | Tabla `asignaciones_maquina`, unique index parcial, FK constraints, RPCs, RLS, audit trigger |
| `supabase/tests/*.sql` | New | Tenant isolation, unique activo, validaciones (tipo máquina, estado máquina, proyecto activo, rol operador) |
| `packages/domain/src/assignments/` | New | DTOs, repository port, domain errors |
| `packages/application/src/assignments/` | New | Use cases con capability checks y validaciones de negocio |
| `packages/infrastructure/src/assignments/` | New | Supabase repository adapter |
| `apps/web/app/dashboard/assignments/` | New | Page + Server Actions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Máquina con asignación activa recibe segunda asignación concurrente | Low | Índice único parcial en DB + validación en application layer antes del insert |
| Operador no es `tenant_user` válido o no tiene rol `operador` | Low | Validación cruzada con `tenant_users` + `user_roles` + `roles` en RPC |
| Tarifa sugerida cambia en catálogo después de creada la asignación | Low | `tarifa_aplicada` persiste snapshot; nunca se recalcula automáticamente |
| Máquina `fuera_de_servicio` o `en_mantenimiento` recibe asignación | Low | Validación en RPC: solo `estado = 'activa'` permite asignación |
| Proyecto finalizado → asignaciones activas quedan huérfanas | Medium | En este MVP no hay trigger automático; documentar como deuda técnica. Workaround: admin debe retirar máquinas manualmente antes de finalizar proyecto |

## Rollback Plan

Revertir migration con `supabase migration repair` + eliminar archivos de paquete y página. Eliminar capability assignments del rol administrador si ya se hubieran aplicado. Si se despliega a prod, usar nueva migration que dropee la tabla y limpie las FK referenciales (no revert manual).

## Dependencies

- Issues #16, #17, #20, #44, #48, #49, #50 — asume máquinas, proyectos, subproyectos, operadores, catálogo de combustibles, permisos ya implementados
- Capacidades `assignments:*` ya existen en `capabilities` y en `default-role-bootstrap.ts` (admin)

## Success Criteria

- [ ] Admin crea asignación: máquina `por_tiempo` activa + proyecto activo + operador con rol `operador` + tarifa aplicada
- [ ] Segunda asignación activa para la misma máquina es rechazada con error claro
- [ ] Máquina `acarreo` o no activa es rechazada en validación de dominio
- [ ] Proyecto no activo es rechazado
- [ ] Usuario sin `assignments:create` no puede crear asignaciones
- [ ] Cross-tenant leakage: tenant A nunca ve asignaciones de tenant B
- [ ] `tarifa_aplicada` persiste snapshot independiente de `maquinas.tarifa_sugerida`
- [ ] `pnpm test` + `pnpm -r typecheck` pasan limpios

## Review Workload Forecast

- Estimated review size: medium (~350-450 lines)
- Chained PRs recommended: Yes — DB migration + domain/infrastructure first, application + UI second
- 400-line budget risk: Medium
- Decision needed before apply: No (auto-chain acceptable)
