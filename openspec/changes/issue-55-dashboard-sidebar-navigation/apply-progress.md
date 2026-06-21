## Completed Slices

- [x] Added shared dashboard module catalog and visibility filtering
  - `apps/web/app/dashboard/_lib/dashboard-modules.ts`
  - Includes shared capability checks for clientes, admin_usuarios, projects, subprojects, machines, categories, and fuel types.
- [x] Added shared sidebar component with active-link support and central logout action
  - `apps/web/app/dashboard/_components/dashboard-sidebar.tsx`
  - `apps/web/app/dashboard/_actions/logout.ts`
- [x] Migrated dashboard page shell to shared sidebar
  - `apps/web/app/dashboard/page.tsx`
- [x] Migrated clientes page shell to shared sidebar
  - `apps/web/app/dashboard/clientes/page.tsx`
- [x] Migrated tipos combustible page shell to shared sidebar
  - `apps/web/app/dashboard/tipos_combustible/page.tsx`
- [x] Migrated admin_usuarios page shell to shared sidebar
  - `apps/web/app/dashboard/admin_usuarios/page.tsx`
- [x] Added / updated runtime tests to verify shared sidebar visibility and active-link classes
  - `apps/web/app/dashboard/page.runtime.test.tsx`
  - `apps/web/app/dashboard/clientes/page.runtime.test.tsx`
  - `apps/web/app/dashboard/tipos_combustible/page.runtime.test.tsx`
  - `apps/web/app/dashboard/admin_usuarios/page.runtime.test.tsx`

## Remaining Slices

- [ ] Run full verification command set (`pnpm lint`, `pnpm -r typecheck`, `pnpm build`) before merge/next PR boundary.
- [ ] Confirm whether dashboard module list should expose only one active entry per section in all remaining dashboard routes.
