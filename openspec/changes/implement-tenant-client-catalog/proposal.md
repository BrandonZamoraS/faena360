# Molecular Spec: Tenant Client Catalog

## Intent

Implement a tenant-scoped client catalog so each company can manage its own clients from the web dashboard. Clients require `nombre`; `telefono`, `correo`, `identificacion`, and `direccion` are optional. Records are never hard-deleted from the platform; hiding uses `estado = 'oculto'`.

## Domain and capabilities

| Area | Decision |
| --- | --- |
| Domain | Client catalog / tenant catalog data |
| Route | `/dashboard/clientes` |
| Table | `clientes` |
| Tenant isolation | Every row must belong to one `tenant_id`; RLS/backend filters must prevent cross-tenant reads and writes. |
| Capabilities | `clients:read`, `clients:create`, `clients:update` |
| Deletion model | No DELETE from app flows. Hide by updating `estado` to `oculto`. |
| Visible records | Normal listings must show only `estado = 'activo'`. |
| Timestamps | Rows should include `created_at` and `updated_at`; `updated_at` must refresh on mutation. |

## Intended behavior

- Authorized users with `clients:read` can view active clients for their current tenant only.
- Authorized users with `clients:create` can create clients in their current tenant only.
- Authorized users with `clients:update` can update client fields and hide clients by setting `estado = 'oculto'`.
- Users without the required capability are denied by default.
- The UI must not expose create/update/hide controls when the session lacks the matching capability.
- Server actions/use cases must repeat capability checks because forms can be posted directly.

## Acceptance scenarios

### Scenario: Tenant reads only own active clients

- Given tenant A and tenant B both have clients
- When a tenant A user with `clients:read` opens `/dashboard/clientes`
- Then only tenant A clients with `estado = 'activo'` are shown
- And tenant B clients are not returned
- And hidden clients are not shown in the normal list

### Scenario: Client creation requires capability and tenant scope

- Given a web user has `clients:create`
- When they submit a valid client with `nombre`
- Then a `clientes` row is created with the session tenant id
- And optional fields may be null or empty-normalized
- And `estado` defaults to `activo`

### Scenario: Missing client name is rejected

- Given a user has `clients:create`
- When they submit an empty `nombre`
- Then the write is rejected before persistence or by a database constraint

### Scenario: Update requires capability

- Given a client belongs to the session tenant
- When a user with `clients:update` edits optional fields or `nombre`
- Then the row is updated and `updated_at` changes

### Scenario: Hide replaces delete

- Given a client belongs to the session tenant
- When a user with `clients:update` hides the client
- Then `estado` becomes `oculto`
- And the row remains in the database
- And it no longer appears in normal listings

### Scenario: Hard delete is denied

- Given authenticated application access
- When a DELETE is attempted on `clientes`
- Then the operation is denied by RLS/default policy/application contract

## Minimal affected code areas

| Path | Expected impact |
| --- | --- |
| `supabase/migrations/*.sql` | Add `clientes` table, estado check, tenant FK, timestamps, RLS policies, no DELETE policy. |
| `supabase/tests/*.sql` | Add tenant isolation, active-only list, create/update/hide, no DELETE tests. Supabase execution requires explicit user approval. |
| `packages/domain/src/` | Add client catalog DTOs/contracts/errors. |
| `packages/application/src/` | Add list/create/update/hide use cases with capability checks. |
| `packages/infrastructure/src/` | Add Supabase repository for `clientes`. |
| `apps/web/app/dashboard/clientes/page.tsx` | Add dashboard page and server actions. |
| `apps/web/app/dashboard/page.tsx` | Add navigation gate for client catalog module. |
| `apps/web/app/dashboard/clientes/page.runtime.test.tsx` | Add UI capability-gating/render tests. |

## Review Workload Forecast

- Estimated review size: medium, likely over 400 changed lines if implemented in one PR.
- Recommended split: database + application/infrastructure first, UI second if review budget must stay near 400 lines.
- Chained PRs recommended: yes, unless the owner explicitly accepts a size exception.
- 400-line budget risk: high.
- Decision needed before apply: yes.
- Review focus: RLS tenant isolation, capability gates duplicated in server actions/use cases, no hard DELETE path, hidden clients excluded from normal lists.

## Risks and questions

| Risk | Mitigation |
| --- | --- |
| Existing UI may expose implementation-ish route naming/copy patterns. | Keep `/dashboard/clientes` user-facing copy clean while preserving current shell conventions. |
| Service-role usage in web server code can bypass RLS if tenant filters are missed. | Require repository methods to always filter by session tenant and keep SQL RLS tests. |
| Supabase tests cannot be run by default. | Ask before running exact Supabase commands during verify/apply. |

## Sources

- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\00-indice-enunciado.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\09-enunciado-parte-9.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\10-enunciado-parte-10.md`
- `H:\Mi unidad\Faena360\01-producto\enunciado-sistema\12-enunciado-parte-12.md`
- `openspec/config.yaml`
- `openspec/specs/effective-capabilities/spec.md`
- `supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql`
