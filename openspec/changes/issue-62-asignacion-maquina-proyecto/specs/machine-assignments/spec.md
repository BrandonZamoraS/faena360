# Machine Assignments Specification

## Purpose

Define tenant-scoped machine-to-project assignments with operator binding for `por_tiempo` machines. Only one active assignment per machine per tenant is allowed. The persisted `tarifa_aplicada` is a contractual snapshot independent of catalog updates.

## Requirements

### Requirement: Create Machine Assignment

The system MUST allow an admin to create an assignment linking a `por_tiempo` machine to an active project with a tenant operator and a locked-in tariff. The system MUST reject the creation when business rules are violated and MUST enforce tenant isolation.

#### Scenario: Admin creates a valid assignment
- GIVEN a machine of type `por_tiempo` with `estado = 'activa'`
- AND an active project
- AND a tenant user with role `operador`
- AND the admin holds `assignments:create`
- WHEN the admin submits the assignment with a tariff value
- THEN the assignment is persisted with `estado = 'activa'` and `tarifa_aplicada` equals the submitted value

#### Scenario: Machine already has an active assignment
- GIVEN a machine already has `estado = 'activa'` in an existing assignment
- WHEN another active assignment is created for the same machine in the same tenant
- THEN the operation returns `{ ok: false, code: "machine_already_assigned" }`

#### Scenario: Machine is not por_tiempo
- GIVEN a machine of type `acarreo`
- WHEN an assignment is created for it
- THEN the operation returns `{ ok: false, code: "machine_not_por_tiempo" }`

#### Scenario: Machine is not active
- GIVEN a machine with `estado = 'fuera_de_servicio'` or `estado = 'en_mantenimiento'`
- WHEN an assignment is created for it
- THEN the operation returns `{ ok: false, code: "machine_not_active" }`

#### Scenario: Project is not active
- GIVEN a project with status other than `activo`
- WHEN an assignment is created referencing it
- THEN the operation returns `{ ok: false, code: "project_not_active" }`

#### Scenario: Operador lacks operador role
- GIVEN a tenant user without the `operador` role
- WHEN they are assigned as the operator
- THEN the operation returns `{ ok: false, code: "user_not_operador" }`

#### Scenario: Admin lacks assignments:create capability
- GIVEN a user without `assignments:create`
- WHEN they attempt to create an assignment
- THEN the operation returns `{ ok: false, code: "capability_denied" }`

#### Scenario: Cross-tenant isolation
- GIVEN tenant A and tenant B each have assignments
- WHEN a user from tenant A queries assignments
- THEN only tenant A's assignments are returned

### Requirement: Update Assignment Status

The system MUST allow updating an assignment's lifecycle status. The admin MUST hold `assignments:update`.

#### Scenario: Admin retires a machine from a project
- GIVEN an assignment with `estado = 'activa'`
- WHEN an admin with `assignments:update` transitions it to `retirada_del_proyecto`
- THEN the status is updated and a `fecha_fin` timestamp is recorded

#### Scenario: Admin closes an assignment on project completion
- GIVEN an assignment with `estado = 'activa'`
- WHEN an admin transitions it to `cerrada_por_finalizacion`
- THEN the status is updated with a `fecha_fin` timestamp

### Requirement: Tarifa Aplicada Immutability

The system MUST persist `tarifa_aplicada` as a snapshot at creation time. The system MUST NOT recalculate it from `maquinas.tarifa_sugerida` after creation. Editing `tarifa_aplicada` post-creation is out of scope.

#### Scenario: Tarifa survives catalog updates
- GIVEN an assignment with `tarifa_aplicada = 150`
- WHEN `maquinas.tarifa_sugerida` is later changed to 200
- THEN the assignment still reports `tarifa_aplicada = 150`

### Requirement: Data Model Integrity

The system MUST enforce the schema below with unique partial index, foreign keys, and audit trigger.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `tenant_id` | `uuid` | FK → `tenants(id)` NOT NULL |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL |
| `proyecto_id` | `uuid` | FK → `proyectos(id)` NOT NULL |
| `subproyecto_id` | `uuid` | FK → `subproyectos(id)` NULL |
| `operador_id` | `uuid` | FK → `tenant_users(id)` NOT NULL |
| `tarifa_aplicada` | `numeric` | NOT NULL, CHECK (≥ 0) |
| `estado` | `text` | NOT NULL, CHECK IN (`activa`, `retirada_del_proyecto`, `cerrada_por_finalizacion`, `bloqueada_por_conflicto`) |
| `fecha_inicio` | `timestamptz` | NOT NULL, DEFAULT `now()` |
| `fecha_fin` | `timestamptz` | NULL |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |
| `created_by` | `uuid` | FK → `auth.users(id)` NOT NULL |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |
| `updated_by` | `uuid` | FK → `auth.users(id)` NULL |

**Unique partial index**: `CREATE UNIQUE INDEX ON asignaciones_maquina (tenant_id, maquina_id) WHERE estado = 'activa'`

**RLS**: deny-all (`USING (false)`). All access through security-definer RPCs.

**Audit trigger**: `audit_asignaciones_maquina` via `audit-log-system`.

### Requirement: Interface Contracts

#### RPC: `create_asignacion`

| Direction | Field | Type | Description |
|-----------|-------|------|-------------|
| IN | `p_tenant_id` | `uuid` | Tenant scope |
| IN | `p_maquina_id` | `uuid` | Machine to assign |
| IN | `p_proyecto_id` | `uuid` | Target project |
| IN | `p_subproyecto_id` | `uuid` | Optional subproject |
| IN | `p_operador_id` | `uuid` | Operator tenant user |
| IN | `p_tarifa_aplicada` | `numeric` | Locked-in tariff |
| OUT | `ok` | `boolean` | Success flag |
| OUT | `data` | `jsonb` | Created assignment row (on success) |
| OUT | `code` | `text` | Error code (on failure) |

#### RPC: `update_asignacion`

| Direction | Field | Type | Description |
|-----------|-------|------|-------------|
| IN | `p_asignacion_id` | `uuid` | Assignment to update |
| IN | `p_estado` | `text` | New lifecycle status |
| OUT | `ok` | `boolean` | Success flag |
| OUT | `data` | `jsonb` | Updated row (on success) |
| OUT | `code` | `text` | Error code (on failure) |

#### RPC: `list_asignaciones_activas`

| Direction | Field | Type | Description |
|-----------|-------|------|-------------|
| IN | `p_tenant_id` | `uuid` | Tenant scope |
| OUT | `data` | `jsonb[]` | Array of active assignments with joined machine/project/operator details |
