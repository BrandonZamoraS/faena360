# Tasks: Configurar ambientes, variables y CI/CD

**GitHub Issue**: #6 | **Branch**: `feat/infra-cicd` | **Retroactive**: Yes — implementation already exists

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 259 implementation lines; total PR exceeds 400 with SDD artifacts |
| 400-line budget risk | Medium with SDD artifacts; implementation scope remains small |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Environment config + CI/CD pipeline + docs | PR 1 (single) | Implementation under budget; SDD artifacts increase total review size |

## Phase 1: Environment Configuration

- [x] 1.1 Create `apps/web/.env.development` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` placeholder values
- [x] 1.2 Create `apps/web/.env.stage` with same keys, stage-prefixed placeholders
- [x] 1.3 Create `apps/web/.env.production` with same keys, prod-prefixed placeholders
- [x] 1.4 Update root `.gitignore` and `apps/web/.gitignore` to add exceptions for `.env.development`, `.env.stage`, `.env.production`

## Phase 2: Build-Time Configuration Validation

- [x] 2.1 Add `validateEnv()` function to `apps/web/next.config.ts` that checks required env vars exist and reject values containing "placeholder"
- [x] 2.2 Call `validateEnv()` at module top-level before exporting nextConfig
- [x] 2.3 Verify: `pnpm build` crashes with `[CRITICAL CONFIG ERROR]` when env vars are missing
- [x] 2.4 Verify: `pnpm build` crashes when env vars contain "placeholder"

## Phase 3: CI Pipeline

- [x] 3.1 Create `.github/workflows/ci.yml` triggering on PRs to `development`, `stage`, `production`
- [x] 3.2 Add steps: checkout, pnpm setup (v11.4.0), node setup (v22), install, format check, lint, typecheck, build
- [x] 3.3 Configure CI build step with dummy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- [ ] 3.4 Verify: CI passes on a test PR (requires remote GitHub Actions run; local equivalent passes)

## Phase 4: Deployment Workflows

- [x] 4.1 Create `.github/workflows/deploy-stage.yml` triggering on push to `stage` with Vercel CLI prebuilt deploy
- [x] 4.2 Create `.github/workflows/deploy-production.yml` triggering on push to `production` with Vercel CLI prebuilt deploy (includes `--prod` flag)
- [x] 4.3 Both workflows must use GitHub secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) and vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- [ ] 4.4 Verify: staging deploy succeeds when `stage` branch is pushed (requires Vercel project setup and remote run)

## Phase 5: Documentation

- [x] 5.1 Create `docs/environments.md` documenting required variables, file locations, secret handling, and GitHub Actions configuration
- [x] 5.2 Create `docs/branch-strategy.md` documenting the four-branch flow and merge rules
