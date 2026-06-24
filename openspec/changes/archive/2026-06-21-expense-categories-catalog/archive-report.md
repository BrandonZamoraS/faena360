## Archive Closure: expense-categories-catalog

- **Change**: Implemented tenant-scoped expense category catalog CRUD and visibility rules at `/dashboard/categorias_gastos`.
- **Status**: Completed and archived. PR #58 merged into `development` on 2026-06-21.

### Changed
- Database migration for `public.categorias_gastos` with tenant isolation, RLS, active-state uniqueness, timestamps, and audit support.
- Runtime and SQL verification for capability checks, tenant scoping, hide/soft-delete behavior, duplicate-name and validation failures.
- Dashboard module behavior updated through tests to enforce capability-gated create/edit/hide flows and tenant-aware mutations.

### Evidence
- `pnpm test -- apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`
- `pnpm test -- apps/web/app/dashboard/page.runtime.test.tsx apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`
- `pnpm -r typecheck`
- `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/categorias_gastos_catalog.sql` (run in apply phase; no critical failures reported)

### Follow-Ups
- No remaining follow-ups recorded in apply-progress.
- Full OpenSpec spec-sync to `openspec/specs/` was not performed (lightweight archive requested).

### Artifact References
- `openspec/changes/archive/2026-06-21-expense-categories-catalog/discovery-molecular-spec.md`
- `openspec/changes/archive/2026-06-21-expense-categories-catalog/design.md`
- `openspec/changes/archive/2026-06-21-expense-categories-catalog/apply-progress.md`
- `supabase/migrations/20260621000000_create_categorias_gastos.sql`
- `supabase/migrations/20260622000000_fix_audit_trigger_tenant_id_for_categorias_gastos.sql`
- `supabase/tests/categorias_gastos_catalog.sql`
- `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`
