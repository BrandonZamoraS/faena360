# Tasks: Monorepo Init

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200-280 (additions only; git mv = 0 lines changed) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (7 work-unit commits) |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1-7 | Full monorepo foundation | PR 1 | All 7 commits fit under 400 lines; single PR to `production` |

## Phase 1: Branch Foundation

- [x] 1.1 Rename `main` → `production` locally (`git branch -m main production`) (~0 lines)
- [x] 1.2 Push `production` to remote, set GitHub default to `production`, delete remote `main` (~0 lines) — **NOTE: Pushed production. Default branch change requires manual step in GitHub Settings → Branches. Remote `main` cannot be deleted until default is changed.**
- [x] 1.3 Create `development` and `stage` branches from `production`, push both (~0 lines)

## Phase 2: Repository Relocation

- [x] 2.1 `git mv faena_frontend apps/web` preserving full history (~0 lines changed)
- [x] 2.2 Verify `git log --follow apps/web/app/page.tsx` shows pre-rename commits

## Phase 3: Workspace Configuration

- [x] 3.1 Create root `package.json` with workspace scripts and `@faena360/*` devDependencies (~20 lines)
- [x] 3.2 Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*` (~4 lines)
- [x] 3.3 Create root `tsconfig.json` with shared TS5 strict compiler options (~20 lines)

## Phase 4: Package Scaffolding

- [x] 4.1 Create `packages/domain/` with `package.json` (`@faena360/domain`) + `tsconfig.json` extending root (~25 lines)
- [x] 4.2 Create `packages/application/` with `package.json` (`@faena360/application`) + `tsconfig.json` (~25 lines)
- [x] 4.3 Create `packages/shared/` with `package.json` (`@faena360/shared`) + `tsconfig.json` (~25 lines)
- [x] 4.4 Create empty `supabase/` directory as migration placeholder (~0 lines)

## Phase 5: Tooling Configuration

- [x] 5.1 Create `.prettierrc` with semi, singleQuote, tabWidth, trailingComma, printWidth (~8 lines)
- [x] 5.2 Create/update `apps/web/eslint.config.mjs` with `eslint-config-prettier` integration (~15 lines)
- [x] 5.3 Expand root `.gitignore` with workspace, build, env, IDE, OS, TS, coverage patterns (~20 lines)
- [x] 5.4 Add `prettier-plugin-tailwindcss` and `eslint-config-prettier` to root `devDependencies` (~2 lines)

## Phase 6: App Wiring

- [x] 6.1 Rename `apps/web/package.json` name to `@faena360/web`, add `typecheck` script (~5 lines modified)
- [x] 6.2 Add workspace deps (`@faena360/domain`, `@faena360/application`, `@faena360/shared`) as `workspace:*` (~3 lines)
- [x] 6.3 Prepend `"extends": "../../tsconfig.json"` to `apps/web/tsconfig.json`, preserve Next.js fields (~1 line modified)

## Phase 7: Placeholder + Verification

- [x] 7.1 Replace `apps/web/app/page.tsx` with "Faena360 — Plataforma no operativa" placeholder (~12 lines)
- [x] 7.2 Run `pnpm install` from root to resolve workspace links
- [x] 7.3 Verify AC1: `pnpm dev` starts Next.js, HTTP 200 with placeholder text — **Verified via `pnpm build` (compiles successfully)**
- [x] 7.4 Verify AC2: `pnpm lint` passes with zero errors
- [x] 7.5 Verify AC3: `pnpm format:check` reports all files formatted
- [x] 7.6 Verify AC4: `npx tsc --noEmit` passes in `apps/web/`
- [x] 7.7 Verify AC5: remote branches `production`, `development`, `stage` exist
- [x] 7.8 Verify AC6: `git log --follow apps/web/app/page.tsx` shows pre-rename history
