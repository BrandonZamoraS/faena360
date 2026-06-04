# Delta Spec: Monorepo Init

## Summary

Implementation delta for `infraestructura-base`. No new or modified requirements — this is the first implementation pass for existing spec requirements.

## Coverage Map: Proposal → Base Spec

| Base Spec Requirement | Status | Detail |
|---|---|---|
| Repository foundation | ✅ Fully covered | Workspace structure, git mv, layer packages, supabase placeholder |
| Public bootstrap availability | ✅ Fully covered | Placeholder page.tsx with "not operational" message |
| Environment-safe delivery (branches only) | ✅ Partially covered | production/development/stage branch creation |
| Environment-safe delivery (CI/CD, PR validation) | 🔲 Out of scope | Explicitly excluded |
| Tenant foundation data | 🔲 Out of scope | Future change |
| Tenant isolation | 🔲 Out of scope | Future change |
| Technical health visibility | 🔲 Out of scope | Future change |

## Gaps Identified

1. **pnpm config drift**: Proposal notes misconfigured `packageManager` field in root `package.json` (CNA default). This fix is implicit in scope but not an explicit task item.
2. **ESLint 9 flat config coexistence**: Prettier coexistence is mentioned but whether `eslint-config-prettier` must be installed or if current config avoids formatting overlap needs design-time resolution.
3. **Branch rename remote-side**: Renaming `main` → `production` requires `git push origin --delete main` + `git push -u origin production` and team communication to avoid orphaned local tracking branches.

## Implementation-Specific Scenarios

### Scenario: Branch rename preserves remote tracking
- GIVEN remote has `main` as default branch
- WHEN `main` is renamed to `production` locally and pushed
- THEN `origin/production` exists, `origin/main` is deleted, and remote default is updated to `production`

### Scenario: git mv preserves file history
- GIVEN `faena_frontend/` exists with commit history
- WHEN `git mv faena_frontend apps/web` is executed
- THEN `git log --follow apps/web/app/page.tsx` shows all prior commits

### Scenario: Prettier does not conflict with ESLint
- GIVEN ESLint 9 flat config is active in `apps/web/`
- WHEN `pnpm format` (Prettier) and `pnpm lint` (ESLint) both run
- THEN neither tool produces formatting rules that contradict the other

### Scenario: Workspace scripts execute from root
- GIVEN the monorepo is initialized with workspace config
- WHEN `pnpm dev` is run from root
- THEN the Next.js dev server starts in `apps/web/`

### Scenario: Clean bootstrap for new contributors
- GIVEN a fresh clone on the `development` branch
- WHEN `pnpm install && pnpm dev` is run
- THEN the placeholder page renders without errors

## Acceptance Criteria

| # | Criterion | Maps to |
|---|-----------|---------|
| AC1 | `pnpm dev` from root starts Next.js and serves HTTP 200 with placeholder text | REQ-IB-02 |
| AC2 | `pnpm lint` passes with zero errors | REQ-IB-01 |
| AC3 | `pnpm format --check` reports all files as formatted | REQ-IB-01 |
| AC4 | `npx tsc --noEmit` passes in `apps/web/` | REQ-IB-01 |
| AC5 | Branches `production`, `development`, `stage` exist in remote | REQ-IB-05 (partial) |
| AC6 | `git log --follow apps/web/app/page.tsx` shows pre-rename history | REQ-IB-01 |
| AC7 | `pnpm-workspace.yaml` declares `apps/*` and `packages/*` | REQ-IB-01 |
| AC8 | Root `package.json` includes `dev`, `lint`, `format`, `build`, `check` scripts using `pnpm -r` | REQ-IB-01 |
| AC9 | `packages/{domain,application,shared}/` each have `package.json` with `@faena360/{layer}` name | REQ-IB-01 |
| AC10 | `.gitignore` excludes `.next/`, `node_modules/`, and supabase secrets | REQ-IB-01 |
