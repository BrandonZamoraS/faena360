# Apply Progress: implement-tenant-client-catalog

## Status

Standard SDD apply slices completed for the first, second, and third stacked-to-main work units.

## Completed Work

- Added the tenant-scoped `clientes` database table with required `nombre`, optional contact fields, `estado` constrained to `activo` or `oculto`, and timestamps.
- Added tenant indexes for catalog lookups and active-list filtering.
- Enabled RLS for tenant-scoped SELECT, INSERT, and UPDATE via `current_app_tenant_id()`.
- Added explicit authenticated DELETE denial; application flows must hide clients with `estado = 'oculto'` instead of deleting rows.
- Added `updated_at` maintenance through the existing `set_updated_at()` trigger.
- Added a `clientes` audit trigger that derives audit tenant from the mutated row and avoids writing client ids into `audit_log.target_user_id`, which references user profiles.
- Added SQL verification coverage for tenant isolation, active-only query behavior, same-tenant insert, cross-tenant insert denial, required name, hide semantics, and hard-delete denial.
- Added domain client catalog contracts for summaries, create/update/hide inputs, repository port, and typed application outcomes.
- Added application client catalog service with `clients:read`, `clients:create`, and `clients:update` effective capability checks.
- Added service-side tenant override protection so payloads cannot spoof `tenant_id`, `tenantId`, or `tenant`.
- Added service-side normalization for client names and optional fields, including empty-name rejection before persistence.
- Added Supabase client catalog repository with mandatory `tenant_id` filters on list/update/hide and active-only listing via `estado = 'activo'`.
- Updated client update/hide mutation contracts so repository zero-row results return a missing-client signal and the application service returns `{ ok: false, code: "missing_client" }` for nonexistent or cross-tenant client ids.
- Added Vitest coverage for service capability gates, tenant scoping, tenant override rejection, required names, hide semantics, and Supabase query filters.
- Added focused Vitest coverage for nonexistent/cross-tenant update and hide mutation behavior.
- Added the web `/dashboard/clientes` page with active-client listing, create/edit/hide forms, and read-only rendering when write capabilities are absent.
- Added server actions for create, update, and hide that refresh the web session, require `clients:read` page access, gate direct POSTs with `clients:create` or `clients:update`, and revalidate `/dashboard/clientes`.
- Updated the dashboard clients module link from `/dashboard/clients` to `/dashboard/clientes`.
- Added runtime UI coverage for dashboard navigation, read-only clients list rendering, write-control visibility, empty state rendering, and direct action gate helpers.
- Exported the client catalog infrastructure repository from the package root barrel so the web app can consume the previously completed repository slice.

## Files Changed

- `supabase/migrations/20260617000000_create_clientes.sql` — creates the `clientes` schema, RLS policies, update trigger, and client audit trigger.
- `supabase/tests/clientes_catalog.sql` — documents and implements SQL checks for the database contract.
- `packages/domain/src/clients/client-catalog.ts` — defines client catalog DTOs, repository port, and outcome/error contracts.
- `packages/domain/src/clients/index.ts` and `packages/domain/src/index.ts` — export client catalog domain contracts.
- `packages/application/src/clients/client-catalog.ts` — implements list/create/update/hide use cases with effective capability checks and tenant spoofing protection.
- `packages/application/src/clients/client-catalog.test.ts` — covers application behavior for the client catalog service.
- `packages/application/src/clients/index.ts` and `packages/application/src/index.ts` — export client catalog application service.
- `packages/infrastructure/src/clients/SupabaseClientCatalogRepository.ts` — implements the Supabase repository with tenant filters and active-only listing.
- `packages/infrastructure/src/clients/SupabaseClientCatalogRepository.test.ts` — covers Supabase query scoping and payload mapping.
- `packages/infrastructure/src/clients/index.ts` and `packages/infrastructure/src/index.ts` — export client catalog infrastructure repository.
- `packages/infrastructure/index.ts` — exports client catalog infrastructure from the workspace package entry used by the web app.
- `apps/web/app/dashboard/clientes/page.tsx` — implements the client catalog page, session/capability gates, server actions, read-only shell, write forms, and hide flow.
- `apps/web/app/dashboard/clientes/page.runtime.test.tsx` — covers UI capability gates and rendering for read-only and write-capable sessions.
- `apps/web/app/dashboard/page.tsx` — updates the clients dashboard module href to `/dashboard/clientes`.
- `apps/web/app/dashboard/page.runtime.test.tsx` — updates navigation expectations for the Spanish clients route.

## Deviations

- The first slice is database-only. Domain/application/infrastructure TypeScript groundwork remains for the next slice to keep the first stacked PR near the 400-line review budget.
- The second slice intentionally excludes the web `/dashboard/clientes` route/actions/navigation to preserve the stacked PR boundary and keep the slice focused on domain/application/infrastructure.
- The third slice intentionally keeps UI styling aligned with existing dashboard/admin patterns instead of introducing a new design system.
- Supabase SQL verification was not executed because Supabase CLI/database execution requires explicit approval.

## Verification Evidence

| Check | Command | Result |
| --- | --- | --- |
| Existing Vitest suite | `pnpm test` | PASS: 21 files, 166 tests |
| New client catalog focused tests, RED | `pnpm vitest run "packages/application/src/clients/client-catalog.test.ts" "packages/infrastructure/src/clients/SupabaseClientCatalogRepository.test.ts"` | FAIL as expected before implementation: missing `./client-catalog` and `./SupabaseClientCatalogRepository` modules |
| New client catalog focused tests, GREEN | `pnpm vitest run "packages/application/src/clients/client-catalog.test.ts" "packages/infrastructure/src/clients/SupabaseClientCatalogRepository.test.ts"` | PASS: 2 files, 8 tests |
| Existing Vitest suite after second slice | `pnpm test` | PASS: 23 files, 174 tests |
| Workspace typecheck | `pnpm -r typecheck` | PASS: domain, shared, application, infrastructure, web |
| Workspace lint | `pnpm lint` | PASS: apps/web ESLint |
| Touched-file formatting | `pnpm exec prettier --write ...touched files...` | PASS: touched files formatted; `packages/infrastructure/src/clients/SupabaseClientCatalogRepository.ts` changed |
| Workspace format check | `pnpm format:check` | FAIL: 91 pre-existing files reported by Prettier, including files outside this slice |
| SQL verification prepared | `supabase db reset` then `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/clientes_catalog.sql` | Not run; requires explicit approval |
| New client catalog UI focused tests, RED | `pnpm vitest run "apps/web/app/dashboard/page.runtime.test.tsx" "apps/web/app/dashboard/clientes/page.runtime.test.tsx"` | FAIL as expected before implementation: missing `./page` for `/dashboard/clientes` and dashboard href still pointed to `/dashboard/clients` |
| New client catalog UI focused tests, GREEN | `pnpm vitest run "apps/web/app/dashboard/page.runtime.test.tsx" "apps/web/app/dashboard/clientes/page.runtime.test.tsx"` | PASS: 2 files, 12 tests |
| Full Vitest suite after third slice | `pnpm test` | PASS: 24 files, 178 tests |
| Workspace typecheck after third slice | `pnpm -r typecheck` | PASS: domain, shared, application, infrastructure, web |
| Workspace lint after third slice | `pnpm lint` | PASS: apps/web ESLint |
| Touched-file formatting after third slice | `pnpm exec prettier --write "apps/web/app/dashboard/page.tsx" "apps/web/app/dashboard/page.runtime.test.tsx" "apps/web/app/dashboard/clientes/page.tsx" "apps/web/app/dashboard/clientes/page.runtime.test.tsx" "packages/infrastructure/index.ts"` | PASS: touched files formatted |
| Review warning regression tests, RED | `pnpm vitest run "packages/application/src/clients/client-catalog.test.ts" "packages/infrastructure/src/clients/SupabaseClientCatalogRepository.test.ts"` | FAIL as expected before fix: repository update/hide returned `undefined`, and application returned `{ ok: true }` for a missing-client repository signal |
| Review warning regression tests, GREEN | `pnpm vitest run "packages/application/src/clients/client-catalog.test.ts" "packages/infrastructure/src/clients/SupabaseClientCatalogRepository.test.ts"` | PASS: 2 files, 10 tests |
| Review warning touched-file formatting | `pnpm exec prettier --write "packages/domain/src/clients/client-catalog.ts" "packages/application/src/clients/client-catalog.ts" "packages/application/src/clients/client-catalog.test.ts" "packages/infrastructure/src/clients/SupabaseClientCatalogRepository.ts" "packages/infrastructure/src/clients/SupabaseClientCatalogRepository.test.ts"` | PASS: touched files formatted |
| Review warning workspace typecheck | `pnpm -r typecheck` | PASS: domain, shared, application, infrastructure, web |

## Remaining Tasks

- [x] Add domain client catalog contracts and exports.
- [x] Add application service/use cases with effective capability checks and tenant override protection.
- [x] Add Supabase repository with tenant filters and active-only listing.
- [x] Add web `/dashboard/clientes` page, actions, and UI capability gates.
- [x] Update dashboard clients module link from `/dashboard/clients` to `/dashboard/clientes`.
