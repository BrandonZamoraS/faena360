# Fuel Types Management Specification

## Purpose

Define CRUD lifecycle for tenant-scoped fuel types (`tipos_combustible`) with soft delete, capability gates per action, and complete tenant isolation.

## Requirements

### Requirement: List fuel types for current tenant

The system MUST return only active fuel types (`estado = 'activo'`) belonging to the actor's effective tenant. The `fuel_types:read` capability is REQUIRED.

#### Scenario: Admin lists active fuel types in their tenant
- GIVEN an Admin authenticated in tenant A with `fuel_types:read`
- WHEN the actor requests the fuel types list
- THEN only active fuel types from tenant A are returned

#### Scenario: Cross-tenant isolation on list
- GIVEN tenant B has fuel type "Gas Licuado"
- WHEN tenant A's Admin lists fuel types
- THEN "Gas Licuado" is NOT included

#### Scenario: Supervisor read-only access
- GIVEN a Supervisor with `fuel_types:read` (no `create`/`update`)
- WHEN the Supervisor views the list
- THEN fuel types are displayed without action controls (create, edit, hide buttons)

#### Scenario: Unauthorized access denied
- GIVEN a user without `fuel_types:read`
- WHEN they navigate to `/dashboard/fuel_types`
- THEN the system redirects or shows an unauthorized state

### Requirement: Create fuel type

The system MUST allow Admins to create fuel types scoped to their tenant. `nombre` MUST be non-empty and unique among active fuel types within the same tenant.

#### Scenario: Admin creates a new fuel type
- GIVEN an Admin with `fuel_types:create` in tenant A
- WHEN they submit `{ nombre: "GLP" }`
- THEN a new record with `tenant_id = A`, `estado = 'activo'` is persisted

#### Scenario: Duplicate name within same tenant rejected
- GIVEN tenant A already has an active fuel type "GLP"
- WHEN Admin submits `{ nombre: "GLP" }`
- THEN the system returns `{ ok: false, code: "duplicate_name" }`

#### Scenario: Empty name rejected
- GIVEN an Admin with `fuel_types:create`
- WHEN they submit `{ nombre: "" }` or `{ nombre: "   " }`
- THEN the system returns `{ ok: false, code: "invalid_name" }`

#### Scenario: Duplicate name allowed if existing is hidden
- GIVEN tenant A has a hidden fuel type "GLP" (estado = 'oculto')
- WHEN Admin creates `{ nombre: "GLP" }`
- THEN creation succeeds — only active names are unique

#### Scenario: Name collision across tenants is allowed
- GIVEN tenant B has an active fuel type "GLP"
- WHEN Admin in tenant A creates `{ nombre: "GLP" }`
- THEN creation succeeds — uniqueness is per-tenant

### Requirement: Update fuel type name

The system MUST allow Admins to rename an active fuel type within their tenant. The new name MUST satisfy the same uniqueness constraint as creation.

#### Scenario: Admin renames a fuel type
- GIVEN an Admin with `fuel_types:update` and fuel type "GLP" in tenant A
- WHEN they submit `{ nombre: "Gas Licuado" }`
- THEN the record is updated and `updated_at` reflects the change

#### Scenario: Rename to duplicate name rejected
- GIVEN fuel types "GLP" and "Diesel" both active in tenant A
- WHEN Admin renames "GLP" to "Diesel"
- THEN the system returns `{ ok: false, code: "duplicate_name" }`

#### Scenario: Supervisor cannot rename
- GIVEN a Supervisor with `fuel_types:read` only
- WHEN they attempt to rename a fuel type
- THEN the operation is rejected before touching the database

### Requirement: Hide fuel type (soft delete)

The system MUST allow Admins to hide a fuel type by setting `estado = 'oculto'`. Hidden types MUST be excluded from listing. The system MUST NOT support physical deletion.

#### Scenario: Admin hides a fuel type
- GIVEN an Admin with `fuel_types:update` and an active fuel type
- WHEN they trigger the hide action
- THEN `estado` changes to `'oculto'` and it disappears from the list

#### Scenario: Hidden type no longer blocks duplicate creation
- GIVEN a hidden fuel type "GLP" in tenant A
- WHEN Admin creates a new "GLP"
- THEN creation succeeds and both records coexist (one hidden, one active)

#### Scenario: DELETE operation is blocked at DB level
- GIVEN any authenticated user
- WHEN a DELETE is attempted on `tipos_combustible`
- THEN RLS policy rejects the operation

### Requirement: Capability gates at page and action level

The system MUST enforce capability checks at both navigation gate (page entry) and Server Action level. Admin role grants `fuel_types:read` + `fuel_types:create` + `fuel_types:update`. Supervisor role ONLY grants `fuel_types:read`.

#### Scenario: Page gate blocks unauthorized navigation
- GIVEN a user without `fuel_types:read`
- WHEN they navigate to `/dashboard/fuel_types`
- THEN the page gate redirects or renders an unauthorized view

#### Scenario: Action gate blocks direct Server Action call
- GIVEN a Supervisor who has `fuel_types:read` but not `fuel_types:create`
- WHEN they craft a direct POST to the create Server Action
- THEN the action rejects with `{ ok: false, code: "unauthorized" }`

## Non-Functional Requirements

- **Data integrity**: Service-role queries MUST append `eq('tenant_id', tenantId)` as defense-in-depth beyond RLS
- **Idempotency**: Hiding an already-hidden type MUST succeed silently
- **Latency**: List operations SHOULD complete within 200ms for up to 50 active types

## Acceptance Criteria

- [ ] Admin creates, renames, and hides fuel types within own tenant
- [ ] Supervisor sees list without action controls and cannot mutate via Server Actions
- [ ] Cross-tenant data leakage: zero exposure of other tenants' fuel types
- [ ] Duplicate active names rejected; unique index enforces this at DB level
- [ ] `pnpm test` + `pnpm -r typecheck` pass clean

## Required Tests

| Layer | Test Type | What It Verifies |
|-------|-----------|-----------------|
| SQL | `supabase/tests/` | Tenant isolation (RLS), unique partial index, no DELETE allowed |
| Application | `*.test.ts` (Vitest) | Use case outcomes (ok/code), capability rejection, edge cases |
| Runtime UI | `*.runtime.test.tsx` | Page gate + action gate rendering per role |
