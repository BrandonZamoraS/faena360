# Design: Asignación Activa Máquina-Proyecto-Operador

## Technical Approach

Implementar el ciclo de vida de asignaciones de máquinas `por_tiempo` a proyectos con operador, siguiendo el patrón hexagonal establecido (máquinas, proyectos, subproyectos). La capa de base de datos impone la regla de negocio crítica (una sola asignación activa por máquina/tenant) mediante índice único parcial; la capa de aplicación valida precondiciones antes de invocar al repositorio; la UI sigue el patrón de formularios server-rendered + server actions del dashboard.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|----------|-------------|-----------|
| **RPC security definer** con capability gate | RLS directo + políticas | Patrón existente en todo el proyecto (máquinas, proyectos, combustibles). Garantiza que toda escritura pasa por validación de permisos y audit context en un solo punto. |
| **Índice único parcial** `(tenant_id, maquina_id) WHERE estado = 'activa'` | Validación solo en app layer; trigger que rechaza duplicados | Elimina race conditions en creación concurrente. Es más barato y declarativo que un trigger. Fallback en app layer para mensaje de error amigable. |
| **Snapshot de `tarifa_aplicada`** | Recalcular desde `maquinas.tarifa_sugerida` en cada lectura | El spec exige inmutabilidad contractual. Una vez creada, la tarifa no debe cambiar aunque el catálogo se actualice. |
| **RLS deny-all** (`USING (false)`) | RLS con políticas de lectura para usuarios autenticados | Patrón existente. Todas las operaciones pasan por RPCs security definer; evita leakage accidental por queries directas. |
| **Validaciones de negocio en application layer** | Validar todo en RPC | Permite testing unitario rápido sin base de datos. Los RPCs se reservan para constraints de integridad referencial y reglas que requieren transaccionalidad. |
| **`user_profiles` como FK de operador** | Crear tabla `tenant_users` | El proyecto no tiene tabla `tenant_users`; los usuarios de tenant viven en `user_profiles`. Se alinea con el schema existente. |

## Data Flow

```
Admin UI
  │ form submit
  ▼
Server Action (apps/web)
  │ valida capability assignments:create
  ▼
Application Service (packages/application)
  │ normaliza input, valida reglas de negocio
  │ (tipo=por_tiempo, máquina activa, proyecto activo, operador con rol)
  ▼
Infra Repository (packages/infrastructure)
  │ invoca RPC security definer vía service_role client
  ▼
Supabase RPC
  │ re-valida capability, ejecuta INSERT/UPDATE
  ▼
public.asignaciones_maquina
  │ trigger audit_asignaciones_maquina
  ▼
audit_log
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260627000000_create_asignaciones_maquina.sql` | Create | Tabla, índices, constraints, RLS, RPCs, audit trigger |
| `supabase/tests/asignaciones_maquina_catalog.sql` | Create | Tests SQL: tenant isolation, unique parcial, validaciones |
| `packages/domain/src/assignments/machine-assignment.ts` | Create | DTOs (`MachineAssignment`, `CreateAssignmentInput`, `AssignmentErrorCode`) y puerto `MachineAssignmentRepository` |
| `packages/domain/src/assignments/index.ts` | Create | Re-exports del módulo |
| `packages/domain/src/index.ts` | Modify | Agregar `export * from "./assignments"` |
| `packages/application/src/assignments/machine-assignment.ts` | Create | Use cases: `createAssignment`, `updateAssignmentStatus`, `listActiveAssignments` |
| `packages/application/src/assignments/machine-assignment.test.ts` | Create | Unit tests con mocks (capability checker + repository) |
| `packages/application/src/assignments/index.ts` | Create | Re-exports |
| `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` | Create | Adapter que invoca `create_asignacion`, `update_asignacion`, `list_asignaciones_activas` |
| `packages/infrastructure/src/assignments/index.ts` | Create | Re-exports |
| `apps/web/app/dashboard/assignments/page.tsx` | Create | Server component: lista asignaciones activas + formulario de alta |
| `apps/web/app/dashboard/assignments/catalog.ts` | Create | Server actions: `createAssignmentAction`, `updateAssignmentStatusAction` + helpers de autorización |
| `apps/web/app/dashboard/assignments/page.runtime.test.tsx` | Create | Runtime UI test: verifica que supervisor sin capability vea redirect/readonly |

## Interfaces / Contracts

### Domain (TypeScript)

```typescript
export type AssignmentEstado =
  | "activa"
  | "retirada_del_proyecto"
  | "cerrada_por_finalizacion"
  | "bloqueada_por_conflicto";

export interface MachineAssignment {
  readonly id: string;
  readonly tenant_id: string;
  readonly maquina_id: string;
  readonly proyecto_id: string;
  readonly subproyecto_id: string | null;
  readonly operador_id: string;
  readonly tarifa_aplicada: number;
  readonly estado: AssignmentEstado;
  readonly fecha_inicio: string;
  readonly fecha_fin: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateAssignmentInput {
  readonly maquina_id: string;
  readonly proyecto_id: string;
  readonly subproyecto_id?: string | null;
  readonly operador_id: string;
  readonly tarifa_aplicada: number;
}

export type AssignmentErrorCode =
  | "missing_tenant"
  | "missing_assignment"
  | "missing_maquina"
  | "missing_proyecto"
  | "missing_operador"
  | "missing_tarifa"
  | "machine_not_por_tiempo"
  | "machine_not_active"
  | "machine_already_assigned"
  | "project_not_active"
  | "user_not_operador"
  | "capability_denied"
  | "assignment_create_failed"
  | "assignment_update_failed"
  | "unknown_error";

export interface AssignmentOutcome {
  readonly ok: boolean;
  readonly assignmentId?: string;
  readonly code?: AssignmentErrorCode;
}

export interface MachineAssignmentRepository {
  listActive(input: { readonly tenantId: string }): Promise<readonly MachineAssignment[]>;
  create(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
  } & CreateAssignmentInput): Promise<{ readonly id: string }>;
  updateStatus(input: {
    readonly tenantId: string;
    readonly assignmentId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly estado: AssignmentEstado;
  }): Promise<boolean>;
}
```

### RPCs (SQL)

`create_asignacion(p_actor_id, p_audit_source, p_tenant_id, p_maquina_id, p_proyecto_id, p_subproyecto_id, p_operador_id, p_tarifa_aplicada)` → `uuid`

`update_asignacion(p_actor_id, p_audit_source, p_asignacion_id, p_estado)` → `boolean`

`list_asignaciones_activas(p_tenant_id)` → `jsonb[]` (joined con máquina, proyecto, operador)

## Sequence Diagrams

### 1. Creación exitosa (happy path)

```
Admin ──► Page: navega a /dashboard/assignments
Page ──► Server Action: submit form (maquina, proyecto, operador, tarifa)
Server Action ──► App Service: createAssignment(session, input)
App Service ──► CapabilityChecker: requireCapability(assignments:create)
CapabilityChecker ──► App Service: ok
App Service ──► App Service: valida tipo=por_tiempo, máquina activa, proyecto activo
App Service ──► Repository: create({...input, tenantId, actorId, auditSource:"web"})
Repository ──► Supabase RPC: create_asignacion(...)
Supabase RPC ──► Supabase RPC: app_user_has_capability → ok
Supabase RPC ──► DB: SELECT tipo, estado FROM maquinas WHERE id = p_maquina_id
Supabase RPC ──► DB: SELECT estado FROM proyectos WHERE id = p_proyecto_id
Supabase RPC ──► DB: SELECT 1 FROM user_roles + roles WHERE operador tiene rol 'operador'
Supabase RPC ──► DB: INSERT INTO asignaciones_maquina
DB ──► Supabase RPC: ok (id generado)
Supabase RPC ──► Repository: id
Repository ──► App Service: { id }
App Service ──► Server Action: { ok: true, assignmentId }
Server Action ──► Page: revalidatePath + redirect/refresh
```

### 2. Error: máquina ya asignada activamente

```
Admin ──► Page: submit form con máquina X
Page ──► Server Action: createAssignmentAction
Server Action ──► App Service: createAssignment(...)
App Service ──► App Service: validaciones de dominio ok
App Service ──► Repository: create(...)
Repository ──► Supabase RPC: create_asignacion(...)
Supabase RPC ──► DB: INSERT ...
DB ──► Supabase RPC: ERROR unique_violation (idx_uq_asignacion_activa)
Supabase RPC ──► Repository: EXCEPTION
Repository ──► App Service: throw { code: "23505" }
App Service ──► Server Action: { ok: false, code: "machine_already_assigned" }
Server Action ──► Page: throw new Error("machine_already_assigned")
Page ──► Admin: error boundary muestra "Esta máquina ya tiene una asignación activa."
```

### 3. Error: permisos (supervisor intenta crear)

```
Supervisor ──► Page: submit form
Page ──► Server Action: createAssignmentAction
Server Action ──► Server Action: guard capability assignments:create → FAIL
Server Action ──► Page: redirect("/dashboard")
Page ──► Supervisor: redirección silenciosa al dashboard
```

## Database Design

### Tabla

```sql
create table public.asignaciones_maquina (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  maquina_id uuid not null references public.maquinas(id) on delete restrict,
  proyecto_id uuid not null references public.proyectos(id) on delete restrict,
  subproyecto_id uuid references public.subproyectos(id) on delete restrict,
  operador_id uuid not null references public.user_profiles(id) on delete restrict,
  tarifa_aplicada numeric not null check (tarifa_aplicada >= 0),
  estado text not null check (estado in ('activa', 'retirada_del_proyecto', 'cerrada_por_finalizacion', 'bloqueada_por_conflicto')),
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
```

### Índices

```sql
create unique index uq_asignacion_activa on public.asignaciones_maquina (tenant_id, maquina_id) where estado = 'activa';
create index idx_asignaciones_tenant_id on public.asignaciones_maquina (tenant_id);
create index idx_asignaciones_tenant_estado on public.asignaciones_maquina (tenant_id, estado);
```

### RLS

```sql
alter table public.asignaciones_maquina enable row level security;
create policy "asignaciones deny all" on public.asignaciones_maquina for all to authenticated using (false) with check (false);
```

### RPCs

- `create_asignacion`: valida `assignments:create`, verifica que máquina sea `por_tiempo` y `activa`, proyecto `activo`, operador tenga rol `operador`, luego INSERT.
- `update_asignacion`: valida `assignments:update`, actualiza `estado` y setea `fecha_fin = now()` cuando el nuevo estado es `retirada_del_proyecto` o `cerrada_por_finalizacion`.
- `list_asignaciones_activas`: devuelve `jsonb[]` con join a `maquinas`, `proyectos`, `user_profiles` para mostrar en UI.

### Audit Trigger

Reutilizar patrón existente: `audit_asignaciones_maquina` AFTER INSERT/UPDATE/DELETE que lee `app.current_actor_id`, `app.audit_source` y escribe en `audit_log` con action `asignacion.create|update|delete`.

## UI/UX Design

### Página `/dashboard/assignments`

- **Header**: título "Asignaciones de máquinas", nombre del tenant.
- **Formulario de alta** (solo si `assignments:create`):
  - **Máquina**: `<select>` con máquinas `por_tiempo` activas del tenant. Validación: required.
  - **Proyecto**: `<select>` con proyectos activos del tenant. Validación: required.
  - **Subproyecto**: `<select>` opcional con subproyectos activos del proyecto seleccionado. Validación: none.
  - **Operador**: `<select>` con tenant users que tengan rol `operador`. Validación: required.
  - **Tarifa aplicada**: `<input type="number" step="0.01" min="0">`. Precargado con `tarifa_sugerida` de la máquina seleccionada (client-side via JS o server-rendered con default). Editable. Validación: required, ≥ 0.
  - **Botón**: "Crear asignación".
- **Lista de asignaciones activas**:
  - Tarjeta por asignación: código de máquina, nombre de proyecto, nombre de operador, tarifa aplicada, estado, fecha de inicio.
  - Acciones (si `assignments:update`): botones "Retirar del proyecto" y "Cerrar por finalización" que cambian el estado y setean `fecha_fin`.

### Mensajes de error

Los server actions propagan códigos como excepciones. El error boundary de la página muestra mensajes amigables:
- `machine_already_assigned`: "Esta máquina ya tiene una asignación activa. Retirala o cerrala antes de crear una nueva."
- `machine_not_por_tiempo`: "Solo se pueden asignar máquinas de tipo 'Por tiempo'."
- `machine_not_active`: "La máquina debe estar activa para asignarla."
- `project_not_active`: "El proyecto debe estar activo."
- `user_not_operador`: "El usuario seleccionado no tiene rol de operador."
- `capability_denied`: redirección silenciosa a `/dashboard`.

## Error Handling Strategy

| Capa | Estrategia |
|------|-----------|
| **Database** | Constraints (`CHECK`, `NOT NULL`, índice único parcial) rechazan datos inválidos con excepciones SQL. RPCs capturan errores de permisos (`42501`) y negocio (`23514`) y los propagan como excepciones. |
| **Infrastructure** | El repository traduce errores de Supabase (object with `code` y `message`) a `Error` estándar de JavaScript, preservando `code` como propiedad opcional. |
| **Application** | El service captura errores del repository: `23505` → `machine_already_assigned`; `42501` → `capability_denied`; cualquier otro → código genérico de fallo (`assignment_create_failed`). Las validaciones de dominio retornan `{ ok: false, code }` sin lanzar excepciones. |
| **Web** | Server actions invocan al service. Si `!result.ok`, lanzan `throw new Error(result.code ?? "...")`. Next.js captura la excepción y la muestra en el error boundary de la página o como mensaje de formulario. |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **SQL** | Tenant isolation, unique parcial activo, validaciones cruzadas (tipo máquina, estado máquina, proyecto activo, rol operador), audit trigger | `supabase/tests/asignaciones_maquina_catalog.sql`: inserts controlados con `begin/rollback` y `do $$ ... raise exception ... end $$` |
| **Unit** | Application service: capability checks, normalización de input, mapeo de errores del repo, lógica de validación de dominio | Vitest con mocks de `MachineAssignmentRepository` y `capabilityChecker`. Ver `machine-catalog.test.ts` como referencia. |
| **Runtime UI** | Permisos: supervisor sin `assignments:create` no ve formulario o es redirigido | `page.runtime.test.tsx` con mock de sesión que tiene/sobran capabilities. |

## Migration / Rollout

No se requiere migración de datos (tabla nueva). El rollout es:
1. Aplicar migration SQL.
2. Desplegar domain/application/infrastructure packages.
3. Desplegar página web.

Rollback: `supabase migration repair` para revertir la migration + eliminar archivos de código. No hay datos críticos en producción a preservar en esta etapa (MVP).

## Open Questions

- [ ] ¿Existe un índice o helper SQL para obtener fácilmente "usuarios del tenant con rol operador"? Si no, el RPC `create_asignacion` hará un `EXISTS` sobre `user_roles + roles` filtrando por `roles.name = 'operador'` o por `roles.id` específico. Se recomienda normalizar por `roles.name` o agregar un `roles.system_key` para estabilidad.
- [ ] El spec menciona `tenant_users` pero el schema real usa `user_profiles`. Se usará `user_profiles(id)` como FK. ¿Se prefiere crear un alias `tenant_users` como view para claridad futura?
