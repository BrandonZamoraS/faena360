## Completed Slices

- [x] Added tenant-scoped `public.categorias_gastos` schema and RLS policies, including active-name uniqueness, timestamps, and audit trigger in `supabase/migrations/20260621000000_create_categorias_gastos.sql`.
- [x] Added `supabase/tests/categorias_gastos_catalog.sql` SQL verification covering tenant isolation, capability-gated reads, mutation denial, soft-delete / hidden state, and uniqueness behavior.
- [x] Extended `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx` to validate real runtime denial paths for:
  - `ExpenseCategoriesPage` when `categories:read` is missing
  - `createExpenseCategoryAction` when `categories:create` is missing
  - `updateExpenseCategoryAction` when `categories:update` is missing
  - `hideExpenseCategoryAction` when `categories:update` is missing
- [x] Fixed TypeScript typing in `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx` by updating `redirectMock` to a single-function-signature mock declaration (`vi.fn<(path: string) => void>()`) compatible with current Vitest typings.
- [x] Added runtime success-path coverage for tenant-scoped mutations in `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`:
   - `createExpenseCategoryAction` uses `tenant_id` from session and includes `estado: "activo"`
   - `updateExpenseCategoryAction` includes `eq("tenant_id", session.tenant_id)` and revalidates the page
    - `hideExpenseCategoryAction` includes `eq("tenant_id", session.tenant_id)` and revalidates the page
- [x] Mocked `next/cache` in `page.runtime.test.tsx` to assert `revalidatePath("/dashboard/categorias_gastos")` on successful create/update/hide actions.
- [x] Extended `apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx` with non-DB runtime gaps for issue #47:
    - empty/whitespace `nombre` rejection for `createExpenseCategoryAction` and `updateExpenseCategoryAction` (`missing_name`)
    - duplicate-name conflict mapping (`23505` -> `duplicate_active_name`) for create/update actions
    - page data load path assertion that categories are queried with tenant scoping and `estado = "activo"`, and active rows render in output
- [x] Fixed SQL audit context for `categorias_gastos` inserts by adding `supabase/migrations/20260622000000_fix_audit_trigger_tenant_id_for_categorias_gastos.sql`:
  - added `categorias_gastos` branch in `audit_trigger()` so tenant-owned rows always write a non-null `tenant_id` into `audit_log`
  - manually re-ran the same migration locally against the already-applied DB to patch in place
- [x] Re-ran `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/categorias_gastos_catalog.sql` after patching `audit_trigger()` and confirmed all assertions passed (including seed inserts under `service_role`).
- [x] Ran and passed focused and dashboard runtime tests plus typecheck:
   - `pnpm test -- apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`
   - `pnpm test -- apps/web/app/dashboard/page.runtime.test.tsx apps/web/app/dashboard/categorias_gastos/page.runtime.test.tsx`
   - `pnpm -r typecheck`
- [x] Hardened SQL fixture role capabilities in `supabase/tests/categorias_gastos_catalog.sql` so both read-only roles are limited to `categories:read`, while the manager role gets read/create/update explicitly, removing the broad pre-seeding/deletion pattern.
- [x] Added minimal SQL assertion coverage in `supabase/tests/categorias_gastos_catalog.sql` for required `nombre` by verifying `NULL` and whitespace-only values are rejected via table constraints.

## Suggested Next Slice

- [ ] None currently; await next scoped change request.
