# Design: Issue 44 Catalog Patterns

## Technical Approach

Establish a small dashboard module registry in `apps/web/app/dashboard/page.tsx` that describes route, label, description, and effective-capability visibility rules for dashboard modules. Keep `/dashboard` gated by refreshed app session, `can_access_web`, and `web.portal.access`; module entries are filtered from the session's `effective_capabilities`.

Issue #44 is a pattern-setting change only: no final CRUD, tables, migrations, or `catalog.*` capabilities. Catalog-like modules use existing read capabilities such as `clients:read`, `categories:read`, and `fuel_types:read`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
| --- | --- | --- | --- |
| Module registry location | Keep the initial registry local to `apps/web/app/dashboard/page.tsx`. | Create a shared package/helper immediately. | The current affected surface is the dashboard shell only; extracting before reuse adds names and indirection without solving issue #44. |
| Authorization source | Filter navigation from `AppSession.effective_capabilities`. | Check roles or default role templates. | The effective-capabilities spec is deny-by-default and includes role grants plus overrides; roles are templates, not authorization decisions. |
| `admin_usuarios` dead-link handling | Treat `admin_usuarios` as an explicit dashboard registry exception requiring `users:read` plus one admin action capability: `users:create` or `users:update`. | Show it for `users:read` and make the page read-only now. | The existing page is an administrative workflow with create/update/deactivate actions and already has a stricter page gate. A read-only user-admin page is product behavior, not just a catalog-pattern convention, so it is out of scope for issue #44. |
| Catalog module scope | Add placeholder navigation contracts for catalog modules using current read capabilities. | Implement tables, CRUD pages, or new capability namespace. | Issue #44 prepares independent module work without colliding with future catalog issues. |
| Validation error shape | Define a minimal reusable type only if implementation introduces action/service validation duplication. | Build a full form/result framework. | The molecular spec asks for a common shape, but issue #44 should avoid framework work until real modules need it. |

## Data Flow

```text
cookies -> requireWebAccess -> refreshed AppSession
   -> createDashboardViewModel -> renderDashboardShell
   -> module registry filters by effective capabilities
   -> visible /dashboard/<module_slug> links only
```

Module pages and Server Actions remain responsible for repeating their own server-side capability gates before reading or mutating data.

## File Changes

| File | Action | Description |
| --- | --- | --- |
| `apps/web/app/dashboard/page.tsx` | Modify | Add dashboard module definitions, capability predicates, and render links from the registry. Preserve dashboard web gate. |
| `apps/web/app/dashboard/page.runtime.test.tsx` | Modify | Cover web-access regression, capability-filtered module links, `admin_usuarios` exception, and validation-error shape if added. |
| `apps/web/app/dashboard/admin_usuarios/page.tsx` | No required change | Existing stricter page/action gates stay aligned with the dashboard exception. |
| `apps/web/app/dashboard/admin_usuarios/page.runtime.test.tsx` | No required change | Existing tests already prove `users:read` alone cannot access the user-admin page. |

## Interfaces / Contracts

The registry should model capability checks as predicates, not hardcoded roles:

```ts
type DashboardModuleDefinition = {
  readonly slug: string;
  readonly href: `/dashboard/${string}`;
  readonly label: string;
  readonly description: string;
  readonly canView: (capabilities: readonly string[]) => boolean;
};
```

Optional validation shape if needed:

```ts
type CatalogValidationError = {
  readonly field?: string;
  readonly code: string;
  readonly message: string;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
| --- | --- | --- |
| Runtime unit | Dashboard redirects without web access or inactive tenant. | Extend `page.runtime.test.tsx` around `createDashboardViewModel`. |
| Runtime unit | Catalog links appear only for matching current `*:read` capabilities. | Render `renderDashboardShell` with focused capability sets. |
| Runtime unit | `admin_usuarios` does not appear for `users:read` alone. | Assert link appears only with `users:read` plus `users:create` or `users:update`. |

No Supabase CLI verification is required for this design.

## Migration / Rollout

No migration required. Rollout is limited to dashboard rendering and tests.

## Open Questions

None blocking for issue #44. Future catalog implementation can revisit route language and read-only page UX per module.
