# Issue #49 Implementation Progress

## Completed Slices

- [x] Added `projects:hide` to default authorization capability seed (`supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql`).
- [x] Added `projects:hide` to administrator default role capabilities (`supabase/scripts/default-role-bootstrap.ts`).
- [x] Switched project module route to Spanish dashboard URI by updating module config to `slug: "proyectos"`, `href: "/dashboard/proyectos"` (`apps/web/app/dashboard/_lib/dashboard-modules.ts`).
- [x] Updated dashboard runtime tests to match `/dashboard/proyectos` path.
- [x] Implemented `projects` domain, application, and infrastructure catalog layers with lifecycle methods and `projects` exports for all three packages (`packages/domain/src/projects`, `packages/application/src/projects`, `packages/infrastructure/src/projects`).
- [x] Added unit tests for `packages/application/src/projects/project-catalog.test.ts` and `packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.test.ts` covering visible listing, input validation, capability gates, lifecycle mutation routing, and RPC argument mapping.
- [x] Implemented `/dashboard/proyectos` UI shell and server actions for `pause`, `finish`, `reopen`, and `hide`, including `projects:*` gates, client selector/name gating behind `clients:read`, default client selection on edit, and explicit forced-transition confirmations (`apps/web/app/dashboard/proyectos/page.tsx`).
- [x] Expanded runtime coverage for administrator and supervisor catalog behavior, including finalized-project reopen controls and active sidebar highlighting (`apps/web/app/dashboard/proyectos/page.runtime.test.tsx`).
- [x] Added SQL fixture coverage for tenant isolation, same-tenant active client validation, required `ubicacion`, required `monto_fijo`, non-hidden tenant name uniqueness, lifecycle transitions, direct mutation denial, and forced open-jornada invalidation flows (`supabase/tests/proyectos_catalog.sql`).

## Suggested Next Slice

- [x] Implement domain/application/infrastructure catalog primitives for `projects` (types, service, repository) and corresponding tests.
- [x] Add `apps/web/app/dashboard/proyectos/page.tsx` with lifecycle actions (`pause`, `finish`, `reopen`, `hide`) and capability gates.
- [x] Add SQL fixture coverage in `supabase/tests/proyectos_catalog.sql` for lifecycle, uniqueness, tenant isolation, and forced transition rules.
- [x] Re-installed worktree dependencies with `pnpm install` and re-ran runtime/type verification after the UI fixes.
- [x] Added finalize cascade for related `subproyectos` when `finish_proyecto` finalizes a project, and extended SQL fixture assertions for the cascade.

## Verification Notes

- Size exception: maintainer-approved single PR remains in effect for this batch.
- `pnpm install` passed and restored the worktree dependency graph.
- `npx vitest run apps/web/app/dashboard/proyectos/page.runtime.test.tsx packages/application/src/projects/project-catalog.test.ts packages/infrastructure/src/projects/SupabaseProjectCatalogRepository.test.ts` passed: 3 files, 15 tests.
- `npx tsc -p packages/application/tsconfig.json --noEmit` passed with no output.
- `npx tsc -p apps/web/tsconfig.json --noEmit` passed with no output after fixing optional form/action and client service typing.
- SQL fixture was authored but not executed because no approved database URL/environment was provided; exact command: `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/proyectos_catalog.sql`.
