# Discovery + Molecular Spec: issue-44-catalog-patterns

## Executive Summary

Establish the minimum shared dashboard/catalog-module conventions so catalog modules can be added independently without conflicting over routes, authorization, navigation, validation errors, or tests. This change must not create final catalog tables, implement full CRUD, introduce `catalog.*` capabilities, or expand operational logic outside MVP 1.2.

## Discovery

### Current State

- `apps/web/app/dashboard/page.tsx` is the dashboard shell and already gates dashboard access with `can_access_web` plus `web.portal.access`.
- `apps/web/lib/auth/session.ts` refreshes server-side session state and recomputes effective capabilities per tenant/user before protected web requests.
- `openspec/specs/effective-capabilities/spec.md` defines deny-by-default tenant-scoped effective capabilities from roles plus user overrides.
- Existing capability vocabulary already includes module read/create/update keys such as `users:*`, `projects:*`, `subprojects:*`, `machines:*`, `clients:*`, `categories:*`, and `fuel_types:*`; issue #44 must reuse those keys.
- Default role configuration makes `administrador` web-enabled with write capabilities and `supervisor` web-enabled with broad read capabilities but no catalog-admin create/update grants for clients/categories/fuel types or tenant admin domains.
- The worktree was reset before starting SDD; implementation changes from the earlier non-SDD attempt are not present in this worktree. SDD apply should implement from this artifact rather than treating prior edits as accepted design.

### Source-of-Truth Constraints

- Product roles are templates only; authorization must be resolved by concrete effective capabilities, not hardcoded role names.
- Modules organize navigation and screens, but they do not replace action-level capability validation.
- Missing capabilities deny by default.
- Tenant data must remain isolated by `tenant_id` across users, roles, catalogs, modules, configuration, history, and files.
- Platform records must not be physically deleted from normal web flows; hidden records must remain for audit and be excluded from normal views.
- Critical rules must be validated in backend/database, not only in UI.

Fuentes vault: `obsidian-vault/01-producto/enunciado-sistema/09-enunciado-parte-9.md`, `obsidian-vault/01-producto/enunciado-sistema/10-enunciado-parte-10.md`, `obsidian-vault/01-producto/enunciado-sistema/12-enunciado-parte-12.md`.

## Intended Behavior

### Routes

Each catalog-like dashboard module should own a stable route under `/dashboard/<module_slug>`. The dashboard index remains `/dashboard` and should render navigation entries from an explicit module definition rather than ad hoc links as modules grow.

Initial known dashboard modules should use current system names/routes, for example:

| Module | Route | Read capability |
| --- | --- | --- |
| User administration | `/dashboard/admin_usuarios` | `users:read` |
| Projects | `/dashboard/projects` | `projects:read` |
| Subprojects | `/dashboard/subprojects` | `subprojects:read` |
| Machines | `/dashboard/machines` | `machines:read` |
| Clients | `/dashboard/clients` | `clients:read` |
| Categories | `/dashboard/categories` | `categories:read` |
| Fuel types | `/dashboard/fuel_types` | `fuel_types:read` |

### Authorization

- Dashboard entry requires a valid refreshed app session, `can_access_web`, and effective `web.portal.access`.
- Module navigation visibility requires the module's effective `*:read` capability.
- Module pages must repeat the relevant page-level effective-capability check server-side before loading module data.
- Server Actions must repeat action-level checks using effective capabilities, e.g. `*:create`, `*:update`, status/hide capability equivalents already present in the current system vocabulary.
- No page or Server Action may grant behavior by checking `roles` directly.

### Validation Error Shape

Catalog modules should return a small common validation-error shape from action/service boundaries when validation fails:

```ts
type CatalogValidationError = {
  readonly field?: string;
  readonly code: string;
  readonly message: string;
};
```

Use stable machine-readable `code` values for tests and UI branching. `message` is display text. `field` is optional for cross-field or form-level errors.

### Navigation Pattern

Dashboard navigation should be capability-driven:

- Include a module only when the refreshed session has that module's `*:read` capability.
- Keep `web.portal.access` as the dashboard gate, not as a substitute for module access.
- Supervisor should naturally see read-only module entries when default capabilities grant read but not create/update.
- If a module has read access but no write capabilities, the page should render read-only UI and avoid displaying mutation controls.

### Module Test Conventions

Each module should add focused runtime tests near the route, following the existing `*.runtime.test.tsx` pattern:

- Navigation test: a module appears only when `effectiveCapabilities` includes its `*:read` capability.
- Dashboard regression test: sessions without `web.portal.access` or without web access still redirect out of `/dashboard`.
- Page gate test: module pages reject sessions lacking the module read capability.
- Server Action test: mutations reject direct invocation when the action capability is missing.
- Read-only test: sessions with read-only capability can view module content but do not see mutation controls.

## Acceptance Scenarios

### Scenario: Dashboard stays web-gated

- GIVEN a session without `web.portal.access` or without `can_access_web`
- WHEN `/dashboard` builds its view model
- THEN the user is redirected out of the dashboard before tenant/module data is exposed

### Scenario: Module navigation follows read capability

- GIVEN an authenticated web session with `clients:read`
- WHEN the dashboard shell renders module navigation
- THEN the clients module link is visible
- AND modules without their `*:read` capability are not visible

### Scenario: Supervisor remains read-only by default

- GIVEN the default supervisor effective capabilities include read grants but not catalog create/update grants
- WHEN a catalog module renders
- THEN read navigation/content may be visible
- AND create/update/hide controls are not visible unless explicit effective capabilities grant those actions

### Scenario: Server Action repeats authorization

- GIVEN a direct POST invokes a catalog mutation Server Action
- WHEN the refreshed session lacks the required effective action capability
- THEN the action rejects before any persistence or revalidation occurs

### Scenario: Hidden records are excluded from normal views

- GIVEN a catalog record has `estado = 'oculto'` or the module's equivalent hidden state
- WHEN a normal catalog list is queried
- THEN the hidden record is excluded
- AND the record remains persisted for audit/support access

### Scenario: Tenant isolation is mandatory

- GIVEN records exist for multiple tenants
- WHEN a catalog module lists or mutates records
- THEN every query/write is scoped to the session's effective `tenant_id`
- AND no tenant override from form data or search params is trusted

## Affected Capability / Domain

- Capability domain: existing ABAC effective capabilities, especially `web.portal.access` and current module keys such as `users:*`, `projects:*`, `subprojects:*`, `machines:*`, `clients:*`, `categories:*`, `fuel_types:*`.
- UI domain: `/dashboard` shell/navigation and module route conventions.
- Application boundary: shared validation-error typing only if it removes real duplication across modules.
- Database boundary: future catalog modules must keep tenant isolation and hidden-state filtering, but this change should not create final catalog tables.

## Minimal Affected Code Areas

- `apps/web/app/dashboard/page.tsx` — dashboard gate and shared module navigation pattern.
- `apps/web/app/dashboard/page.runtime.test.tsx` — dashboard navigation and web-access regression tests.
- `apps/web/app/dashboard/<module>/page.tsx` — future route/page pattern for page-level capability gates and read-only rendering.
- `apps/web/app/dashboard/<module>/page.runtime.test.tsx` — future module-specific runtime tests.
- Shared helper/type only if multiple modules duplicate the same module-definition or validation-error shape during implementation.

## Out Of Scope

- Creating final catalog tables.
- Implementing complete CRUD for a catalog.
- Introducing or migrating to `catalog.*` capability keys.
- Changing the current effective-capability model.
- Adding physical DELETE behavior from the web platform.
- Implementing operational logic beyond MVP 1.2 catalog/module conventions.

## Risks / Questions

- Route naming may need product-owner confirmation for Spanish vs English slugs before many modules ship; this artifact proposes stable route examples from existing capability/module vocabulary.
- `admin_usuarios` currently has a stricter page/navigation gate in local code than pure `users:read`; SDD design/apply must decide whether user administration is an exception because the page exposes administrative workflows, or whether it should be split/read-only to match the shared `*:read` navigation rule.
- Earlier non-SDD implementation exposed a real design risk: `admin_usuarios` can become a dead link if dashboard navigation uses only `users:read` while the page still requires write capabilities. Next phases should resolve that explicitly.
