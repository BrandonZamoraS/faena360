# Apply Progress: issue-44-catalog-patterns

## Status

Standard SDD apply slice completed.

## Completed Work

- Added a local dashboard module registry in `apps/web/app/dashboard/page.tsx`.
- Filtered dashboard module navigation with effective-capability predicates instead of role checks.
- Preserved the dashboard entry gate for refreshed session context, `can_access_web`, and `web.portal.access`.
- Kept `admin_usuarios` as an explicit exception requiring `users:read` plus `users:create` or `users:update`.
- Added catalog-like module entries for current capability keys only: `projects:read`, `subprojects:read`, `machines:read`, `clients:read`, `categories:read`, and `fuel_types:read`.
- Added the minimal `CatalogValidationError` type without introducing a result framework or catalog CRUD.
- Extended dashboard runtime tests for the web gate and capability-filtered module links.

## Files Changed

- `apps/web/app/dashboard/page.tsx` — added registry types, module definitions, capability predicates, and registry-rendered navigation.
- `apps/web/app/dashboard/page.runtime.test.tsx` — added focused runtime coverage for web/portal gating and catalog-like module visibility.

## Deviations

None. Implementation follows the molecular spec and design constraints.

## Verification

- RED: `pnpm exec vitest run apps/web/app/dashboard/page.runtime.test.tsx` failed before implementation on missing catalog/project links.
- GREEN: `pnpm exec vitest run apps/web/app/dashboard/page.runtime.test.tsx` passed after implementation.
- Final: `pnpm exec vitest run apps/web/app/dashboard/page.runtime.test.tsx apps/web/app/dashboard/admin_usuarios/page.runtime.test.tsx` passed with 2 files and 13 tests.
- Final: `pnpm --filter @faena360/web typecheck` passed.

## Out Of Scope Preserved

- No catalog CRUD, pages, tables, migrations, Supabase CLI commands, or `catalog.*` capabilities were added.
