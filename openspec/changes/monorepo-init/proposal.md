# Proposal: Monorepo Init

## Intent

Initialize the Faena360 modular monorepo as defined in GitHub issue #2. The repo currently has a flat `faena_frontend/` Next.js project with no workspace structure, a misconfigured pnpm config, a single branch, and a CNA template placeholder. This change implements the "Repository foundation" and "Public bootstrap availability" requirements from `infraestructura-base`.

## Scope

### In Scope
- Rename `main` → `production`, create `development` and `stage` branches
- `git mv faena_frontend/ → apps/web/` (preserves history)
- Root `package.json` with workspace scripts (`dev`, `lint`, `format`, `build`, `check`)
- `pnpm-workspace.yaml` declaring `apps/*` + `packages/*`
- Root `tsconfig.json` as shared TypeScript base
- Empty packages: `packages/{domain,application,shared}/` with `package.json` + `tsconfig.json`
- `supabase/` empty directory for future migrations
- Replace `apps/web/app/page.tsx` with placeholder ("system not operational")
- Prettier configuration (coexists with ESLint 9)
- Expand `.gitignore` for workspace patterns

### Out of Scope
- CI/CD pipelines, GitHub Actions, PR validation
- Supabase configuration, env files, migrations
- Tenant data model, health endpoint, storage isolation
- Auth, tenant-aware access, API routes

## Capabilities

### New Capabilities

None — the `infraestructura-base` spec already covers all requirements this change implements.

### Modified Capabilities

None — requirements are not changing. This is a first implementation of existing spec requirements.

## Approach

1. **Branch setup**: rename `main` → `production` via `git branch -m`; create `development` and `stage` from production.
2. **Relocate frontend**: `git mv faena_frontend apps/web` preserves full commit history.
3. **Workspace config**: root `package.json` (workspace root), `pnpm-workspace.yaml`, root `tsconfig.json` with shared compiler options.
4. **Layer packages**: scaffold `packages/{domain,application,shared}` with minimal `package.json` (`"name": "@faena360/{layer}"`) + `tsconfig.json` extending root.
5. **Placeholder**: replace CNA template page with "Faena360 — plataforma no operativa" message.
6. **Tooling**: `.prettierrc` at root; `.gitignore` updated with workspace exclusions.
7. **Verify**: `pnpm dev`, `pnpm lint`, `pnpm format --check`, `npx tsc --noEmit` all pass.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `faena_frontend/` → `apps/web/` | Moved | Git rename; Next.js root moves under `apps/` |
| `/package.json` | New | Workspace root with `pnpm -r` scripts |
| `/pnpm-workspace.yaml` | New/Replaced | Declare `apps/*` and `packages/*` |
| `/tsconfig.json` | New | Shared TS5 strict base |
| `/packages/{domain,application,shared}/` | New | Hexagonal layers (empty, typed) |
| `/supabase/` | New | Migration placeholder |
| `apps/web/app/page.tsx` | Modified | Placeholder content |
| `/.prettierrc` | New | Formatter config |
| `/.gitignore` | Modified | Workspace + tooling patterns |
| Git branches | Modified | Rename `main`, add `development` + `stage` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Branch rename orphans remote tracking | Medium | Notify team; push after rename with `git push origin --delete main` + `git push -u origin production` |
| Import paths break after `git mv` | Low | Next.js auto-resolves relative imports; verify with `pnpm build` |
| `prettier` vs `eslint` formatting conflict | Low | `eslint-config-prettier` disables ESLint formatting rules; run both in sequence |
| Cached `.next/` or `node_modules/` paths stale | Low | `pnpm clean` script or manual `rm -rf` before verification |

## Rollback Plan

1. `git mv apps/web faena_frontend` — undo relocation
2. `git branch -m production main` — undo branch rename
3. Delete created files: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `packages/`, `supabase/`, `.prettierrc`
4. Restore `.gitignore` to prior content
5. Remove `development` and `stage` branches
6. Verify: `cd faena_frontend && pnpm dev` works as before

## Dependencies

- GitHub issue #2 (`feat(infra): inicializar monorepo y scripts base`) — approved
- `openspec/specs/infraestructura-base/spec.md` — source spec for requirements

## Success Criteria

- [ ] `pnpm dev` from root starts Next.js and returns HTTP 200 with placeholder text
- [ ] `pnpm lint` passes (ESLint 9, no errors)
- [ ] `pnpm format --check` passes (Prettier, no unformatted files)
- [ ] `npx tsc --noEmit` passes in `apps/web/`
- [ ] Branches `production`, `development`, `stage` exist in remote
- [ ] `git log --follow apps/web/app/page.tsx` shows commits from pre-rename history
- [ ] `pnpm-workspace.yaml` has correct `packages:` declaration
