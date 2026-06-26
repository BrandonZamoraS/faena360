# Spec: Consultar Asignaciones Activas e Historial por Rol

## Domain: assignment-history (New)

### Purpose
Timeline de cambios por asignación desde `audit_log` existente, sin tabla dedicada.

### Requirements

| # | Requirement | Strength | Key Scenarios |
|---|------------|----------|---------------|
| R1 | `list_asignacion_historial(p_tenant_id, p_asignacion_id)` devuelve `jsonb[]` con entradas `audit_log` filtradas por `(new_value->>'id')::uuid = p_asignacion_id` + `action LIKE 'asignacion.%'`, orden `occurred_at DESC`. RPC `security definer`. Sin acceso directo a tabla (RLS deny-all). | MUST | **Timeline completo**: creación + 2 updates → 3 entradas (create con new_value completo, updates con diff+id). **Sin updates**: solo create entry. **Asignación inexistente**: array vacío. **Cross-tenant**: array vacío si p_tenant_id no matchea. |
| R2 | Trigger `audit_asignaciones_maquina` incluye `id` en `old_value` y `new_value` para UPDATEs. | MUST | **UPDATE**: old_value `{"id":"<uuid>","estado":"activa"}`, new_value `{"id":"<uuid>","estado":"retirada..."}`. INSERT/DELETE ya incluyen `id` por `to_jsonb(row)`. |
| R3 | Expression index `idx_audit_log_assignment_id` sobre `((new_value->>'id'))` con WHERE `action LIKE 'asignacion.%'`. | MUST | Acelera filtro por assignment en `audit_log` (≤10 entradas esperadas por asignación). |
| R4 | Solo `assignments:read` accede al historial. RPC verifica `app_user_has_capability()`. | MUST | **Con capability**: ok. **Sin capability**: `42501`. |

### Acceptance Criteria
- [ ] `list_asignacion_historial` devuelve timeline completo (creación + cambios)
- [ ] Entradas de otros tenants no aparecen
- [ ] Trigger incluye `id` en diffs de UPDATE
- [ ] `assignments:read` requerido; sin él → 42501

---

## Domain: machine-assignments (Modified)

### MODIFIED Requirements

#### R1: Filtros en list_asignaciones_activas
(Previously: solo aceptaba `p_tenant_id`)

Firma extendida: `list_asignaciones_activas(p_tenant_id uuid, p_proyecto_id uuid DEFAULT NULL, p_maquina_id uuid DEFAULT NULL)`. WHERE usa `coalesce` para ignorar nulos.

| Scenario | GIVEN | THEN |
|----------|-------|------|
| Sin filtros | 3 asignaciones activas | 3 entradas (backward-compatible) |
| `p_proyecto_id=A` | 2 en A, 1 en B | 2 entradas |
| `p_maquina_id=X` | X activa, Y sin | 1 entrada |
| Ambos filtros | Ambos matchean | Intersección |
| Sin resultados | Máquina sin activas | Array vacío |

#### R2: Nuevos índices en asignaciones_maquina
(Previously: solo `idx_asignaciones_tenant_id`, `idx_asignaciones_tenant_estado`, partial `uq_asignacion_activa`)

| Índice | Columnas | Propósito |
|--------|----------|-----------|
| `idx_asignaciones_tenant_proyecto` | `(tenant_id, proyecto_id)` | Filtro por proyecto |
| `idx_asignaciones_tenant_proyecto_estado` | `(tenant_id, proyecto_id, estado)` | Reporting + filtro combinado |

#### R3: UI con filtros y drawer de historial
(Previously: listado plano, sin acceso a cambios históricos)

Página `/dashboard/assignments` agrega:
- Dropdowns proyecto/máquina que recargan vía URL search params
- Botón "Historial" por fila → drawer con timeline: timestamp, acción, campos modificados, actor

| Scenario | GIVEN | THEN |
|----------|-------|------|
| Supervisor (solo `assignments:read`) | Carga página | Ve filtros + listado + "Historial". NO ve formulario creación ni botones retirar/cerrar |
| Admin (read+create+update) | Carga página | Ve filtros + acciones + "Historial" |
| Sin `assignments:read` | Intenta acceder | Redirect `/dashboard` |

### REMOVED Requirements
(Ninguno — solo extensiones sin breaking changes)

### Acceptance Criteria
- [ ] `list_asignaciones_activas` filtra por proyecto y máquina
- [ ] Firma backward-compatible (sin filtros = mismo resultado)
- [ ] Supervisor ve UI en modo solo lectura
- [ ] Usuario sin capability → redirect
- [ ] Tenant isolation sin leakage
