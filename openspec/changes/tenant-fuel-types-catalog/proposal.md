# Proposal: Tenant Fuel Types Catalog

## Intent

Implementar el primer catálogo CRUD real del proyecto: `tipos_combustible`. Cada tenant gestiona sus propios tipos de combustible desde el dashboard web. Registros nunca se eliminan — se ocultan con `estado = 'oculto'`.

## Scope

### In Scope
- Tabla `tipos_combustible` con columnas: `id`, `tenant_id`, `nombre`, `estado` (`activo`|`oculto`), `created_at`, `updated_at`
- `nombre` único por tenant entre registros no ocultos + NOT NULL
- RLS policies por `tenant_id` usando `current_app_tenant_id()`
- UI `/dashboard/fuel_types`: listado, creación, edición inline, ocultamiento
- Server Actions con gate de capacidades (`fuel_types:read`/`create`/`update`)
- Supervisor ve listado sin acciones; Admin ve todas las acciones
- Tests SQL (tenant isolation, unicidad, soft delete) + unit (use cases) + runtime UI (permisos)

### Out of Scope
- Borrado físico (DELETE denegado por RLS)
- Ordenamiento, paginación, búsqueda avanzada
- Bulk operations o importación
- Relaciones con otras tablas (proyectos, maquinaria)

## Capabilities

### New Capabilities
- `fuel-types-management`: CRUD lifecycle para tipos de combustible con tenant isolation, soft delete, y gates de capacidad por acción

### Modified Capabilities
- None — capacidades `fuel_types:read`/`create`/`update` ya existen en seeds y roles

## Approach

Arquitectura hexagonal siguiendo patrón establecido:
1. **Domain**: DTOs (`FuelType`, `CreateFuelTypeInput`, `UpdateFuelTypeInput`) + contrato `FuelTypeRepository` con errores de dominio
2. **Application**: `listFuelTypes`, `createFuelType`, `updateFuelType`, `hideFuelType` — cada uno recibe `capabilities` + `tenant_id` y aplica `requireCapability`
3. **Infrastructure**: `SupabaseFuelTypeRepository` con filtro `tenant_id` vía service-role (no depende de RLS solo)
4. **Web**: `apps/web/app/dashboard/fuel_types/page.tsx` con navigation gate ya existente en `page.tsx:102-108`

Patrón de outcome: `{ ok, code }` — sin excepciones para flujos de negocio.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*.sql` | New | Tabla `tipos_combustible`, check estado, unique index parcial, RLS policies |
| `supabase/tests/*.sql` | New | Tenant isolation, unicidad nombre, soft delete, no DELETE |
| `packages/domain/src/fuel-types/` | New | DTOs, repository port, domain errors |
| `packages/application/src/fuel-types/` | New | Use cases con capability checks |
| `packages/infrastructure/src/fuel-types/` | New | Supabase repository adapter |
| `apps/web/app/dashboard/fuel_types/` | New | Page + Server Actions + runtime tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Service-role bypassa RLS si falta filtro tenant_id | Low | Repository fuerza `eq('tenant_id', tenantId)` en toda query |
| Supervisor ve acciones indebidas | Low | Page gate + Server Action gate duplican chequeo de capacidad |
| Unique index parcial no soportado en Supabase | Low | Verificar compatibilidad PostgreSQL 15; fallback: trigger BEFORE INSERT |

## Rollback Plan

Revertir migration con `supabase migration repair` + eliminar archivos de paquete y página. No hay datos críticos en catálogo inicial. Si se despliega a prod, usar nueva migration que dropee la tabla (no revert manual).

## Dependencies

- Ninguna externa. Capacidades `fuel_types:*` ya existen. Navegación en dashboard ya registrada.

## Success Criteria

- [ ] Admin crea, edita y oculta tipos de combustible dentro de su tenant
- [ ] Supervisor ve listado pero no ve botones de acción
- [ ] Usuario sin `fuel_types:read` no accede a la ruta
- [ ] Cross-tenant leakage: tenant A nunca ve datos de tenant B
- [ ] `nombre` vacío o duplicado (mismo tenant, activo) es rechazado
- [ ] `pnpm test` + `pnpm -r typecheck` pasan limpios

## Review Workload Forecast

- Estimated review size: medium (~350-500 lines)
- Chained PRs recommended: Yes — DB + domain/infrastructure first, UI second
- 400-line budget risk: Medium
- Decision needed before apply: No (auto-chain acceptable)
