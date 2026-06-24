# Molecular Spec: issue-55-dashboard-sidebar-navigation

## Executive summary

Unify dashboard sidebar rendering so every `/dashboard` page uses one shared sidebar base, filters modules from the same capability-driven source, preserves logout, and highlights the active route without page-local hardcoded nav.

## Intended behavior

- A shared dashboard sidebar contract MUST render from one central module definition source.
- The dashboard index and internal dashboard pages MUST use that same sidebar base instead of duplicating `<aside>`, module links, and logout markup.
- Sidebar module visibility MUST follow effective capabilities exactly as today: `web.portal.access` gates dashboard entry; each module link requires its module-level capability rule.
- The current route MUST be marked active via route input (`activeHref`, `activeSlug`, or equivalent shared contract), not by page-local hardcoded classes.
- Internal pages such as `/dashboard/clientes` and `/dashboard/tipos_combustible` MUST show the same visible module set as `/dashboard`, not only `Dashboard + current module`.
- Logout MUST remain available from the shared sidebar on every dashboard page.

## Affected capability / domain

- Existing capability domain only; no new authorization semantics.
- Primary domain: dashboard web navigation shell.
- Existing capability rules reused:
  - `web.portal.access`
  - `users:read` + (`users:create` or `users:update`) for `admin_usuarios`
  - `projects:read`, `subprojects:read`, `machines:read`, `clients:read`, `categories:read`, `fuel_types:read`

## Acceptance scenarios

1. **Dashboard shows allowed modules from shared config**
   - GIVEN a web-enabled session with `clients:read`, `categories:read`, and `fuel_types:read`
   - WHEN `/dashboard` renders
   - THEN the sidebar shows those modules from the shared module source
   - AND modules without read access remain hidden.

2. **Clientes page reuses shared sidebar and marks active route**
   - GIVEN a web-enabled session with `clients:read`
   - WHEN `/dashboard/clientes` renders
   - THEN the sidebar matches the dashboard module set for that session
   - AND `Clientes` is the active module.

3. **Tipos de combustible page reuses shared sidebar and marks active route**
   - GIVEN a web-enabled session with `fuel_types:read`
   - WHEN `/dashboard/tipos_combustible` renders
   - THEN the sidebar matches the dashboard module set for that session
   - AND `Tipos de combustible` is the active module.

4. **Disallowed modules stay hidden on internal pages**
   - GIVEN a session lacks `categories:read` and `machines:read`
   - WHEN any dashboard page renders its sidebar
   - THEN `Categorías` and `Maquinaria` are not shown.

5. **Logout remains globally available**
   - GIVEN an authenticated dashboard page
   - WHEN the shared sidebar renders
   - THEN it includes the logout action.

## Risks / questions

- `apps/web/app/dashboard/admin_usuarios/page.tsx` also duplicates the sidebar even though it was not called out in the issue summary; leaving it bespoke would conflict with the stated goal of unifying sidebar navigation across dashboard pages.
- `DASHBOARD_MODULES` currently lives inside `apps/web/app/dashboard/page.tsx`; apply should decide whether the shared contract lives beside the new sidebar component or in a dedicated dashboard module config file.
- This change should not alter page-level authorization rules for catalog/admin pages; it only centralizes navigation rendering.

## Minimal affected code areas

- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/dashboard/clientes/page.tsx`
- `apps/web/app/dashboard/tipos_combustible/page.tsx`
- `apps/web/app/dashboard/admin_usuarios/page.tsx`
- `apps/web/app/dashboard/page.runtime.test.tsx`
- `apps/web/app/dashboard/clientes/page.runtime.test.tsx`
- `apps/web/app/dashboard/tipos_combustible/page.runtime.test.tsx`
- Shared dashboard sidebar/module-config file(s) to be introduced during apply

## Review workload forecast

- Estimated changed lines: 180-280
- Chained PRs recommended: No
- Reason: shared extraction + 4 page refactors + runtime test updates should stay within the 400-line review budget if scoped to navigation only.
