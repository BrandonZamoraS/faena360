# Design: Issue 55 Dashboard Sidebar Navigation

## Technical Approach

Extract dashboard navigation into a server-rendered shared sidebar and move `DASHBOARD_MODULES` out of `app/dashboard/page.tsx` into a reusable dashboard module config. The dashboard index and internal pages (`clientes`, `tipos_combustible`, `admin_usuarios`) will render the same sidebar with effective capabilities and an active route marker. Page-level authorization, catalog/admin actions, tenant lookups, and content layout stay in the current page modules.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Sidebar placement | Create `apps/web/app/dashboard/_components/dashboard-sidebar.tsx` | Keep JSX in pages; move to global `components/` | `_components` keeps the UI private to the dashboard route and avoids expanding public component API. |
| Module source | Create `apps/web/app/dashboard/_lib/dashboard-modules.ts` exporting `DASHBOARD_MODULES`, `getVisibleDashboardModules`, and types | Leave config in `page.tsx`; duplicate capability helpers | Internal pages need the same filtered module set; centralizing avoids drift in labels, hrefs, descriptions, and capability rules. |
| Active state | Sidebar accepts `activeHref?: "/dashboard" | "/dashboard/${string}"` and compares against each link href | Infer from `usePathname`; pass `activeSlug` only | Server-rendered pages already know the active page. Passing href avoids client component conversion and handles `/dashboard` distinctly. |
| Logout | Create shared server action `apps/web/app/dashboard/_actions/logout.ts` and use it from the sidebar form | Keep one `logoutAction` per page; pass action prop | Centralizes duplicated cookie deletion while preserving the existing POST form behavior and redirect target. |

## Data Flow

```text
Page session.effective_capabilities
        │
        ├─ page-specific gate/action checks stay local
        │
        └─ DashboardSidebar
              └─ getVisibleDashboardModules(capabilities)
                    └─ DASHBOARD_MODULES capability predicates
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/app/dashboard/_lib/dashboard-modules.ts` | Create | Shared module definitions, capability helpers, and visible-module filter. |
| `apps/web/app/dashboard/_components/dashboard-sidebar.tsx` | Create | Renders brand, `Dashboard`, capability-filtered modules, active styles, descriptions, and logout form. |
| `apps/web/app/dashboard/_actions/logout.ts` | Create | Shared server action deleting `APP_SESSION_COOKIE_NAME` and redirecting to `/`. |
| `apps/web/app/dashboard/page.tsx` | Modify | Remove local module/sidebar/logout duplication; use shared sidebar with `activeHref="/dashboard"`. |
| `apps/web/app/dashboard/clientes/page.tsx` | Modify | Replace page-local aside/logout with shared sidebar and `activeHref="/dashboard/clientes"`. |
| `apps/web/app/dashboard/tipos_combustible/page.tsx` | Modify | Replace page-local aside/logout with shared sidebar and `activeHref="/dashboard/tipos_combustible"`. |
| `apps/web/app/dashboard/admin_usuarios/page.tsx` | Modify | Replace page-local aside/logout with shared sidebar and `activeHref="/dashboard/admin_usuarios"`. |
| Runtime tests under `apps/web/app/dashboard/**/page.runtime.test.tsx` | Modify | Assert shared visible module set, active class target, filtering, and logout presence. |

## Interfaces / Contracts

```ts
export type DashboardModuleDefinition = {
  readonly slug: string;
  readonly href: "/dashboard/${string}";
  readonly label: string;
  readonly description: string;
  readonly canView: (capabilities: readonly string[]) => boolean;
};

export function getVisibleDashboardModules(
  capabilities: readonly string[]
): readonly DashboardModuleDefinition[];
```

`DashboardSidebar` contract: `{ capabilities: readonly string[]; activeHref: "/dashboard" | "/dashboard/${string}" }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/runtime | Module filtering and admin rule | Update dashboard runtime tests around `getVisibleDashboardModules` or rendered HTML. |
| Runtime render | Active link and full shared nav on all four pages | Update existing page runtime tests to render shell functions with multiple capabilities. |
| E2E | Not applicable | No E2E runner installed. |

## Migration / Rollout

No migration required. This is a server-rendered UI extraction with no schema, auth, or data contract changes.

## Review Workload Forecast

- Estimated changed lines with `admin_usuarios`: 220-340.
- Chained PRs recommended: No, if implementation is limited to sidebar extraction and runtime tests.
- Review note: keep catalog/admin business logic untouched to stay under the 400-line review budget.

## Open Questions

None.
