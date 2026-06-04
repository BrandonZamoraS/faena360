# Proposal: Configurar ambientes, variables y CI/CD

**GitHub Issue**: #6 `feat(infra): configurar ambientes, variables y CI/CD`
**Status**: Retroactive — implementation already exists on branch `feat/infra-cicd`

## Intent

Establish the environment configuration, CI validation, and deployment pipeline Foundation for Faena360. This change implements the "Environment-safe delivery" requirement from `infraestructura-base`, ensuring builds fail explicitly when critical config is missing, PRs run validation before merge, and stage/production deployments follow their designated release branches.

## Scope

### In Scope
- Three environment variable files (`.env.development`, `.env.stage`, `.env.production`) with placeholder Supabase credentials
- Build-time critical environment validation in `next.config.ts` (blocks deploy on missing/placeholder values)
- CI GitHub Actions workflow (lint, format check, typecheck, build) on PRs to `development`, `stage`, `production`
- Deploy-to-staging GitHub Actions workflow (push to `stage` → Vercel preview deploy)
- Deploy-to-production GitHub Actions workflow (push to `production` → Vercel production deploy)
- `.gitignore` exceptions for tracked env files
- Environment and branch strategy documentation

### Out of Scope
- Health endpoint (`GET /api/health`) — deferred to a future change
- Supabase migrations or tenant data model
- Server-side environment variables (e.g., `SUPABASE_SERVICE_ROLE_KEY`) wired into the app
- Vercel project setup or domain configuration
- Any deployment provider other than Vercel

## Capabilities

### New Capabilities

None — this change implements parts of the existing `infraestructura-base` capability.

### Modified Capabilities

- `infraestructura-base`: Adds concrete CI/CD pipeline definitions, environment variable files, and build-time validation that fulfill the "Environment-safe delivery" requirement scenario.

## Approach

1. **Env files**: Create three `.env.*` files under `apps/web/` with `NEXT_PUBLIC_` placeholder variables. Adjust `.gitignore` to allow these specific files while excluding generic `.env*`.
2. **Config validation**: Add `validateEnv()` to `next.config.ts` that checks required `NEXT_PUBLIC_` variables and rejects values containing "placeholder" — blocking accidental deploy with dummy values.
3. **CI workflow**: GitHub Actions on PRs to `development`, `stage`, `production` running lint, format check, typecheck, and build with dummy env vars for CI.
4. **Deploy workflows**: Two Vercel CLI-based workflows — staging on push to `stage`, production on push to `production` — pulling secrets from GitHub Actions and building via Vercel's prebuilt deploy flow.
5. **Documentation**: `docs/environments.md` and `docs/branch-strategy.md` describing variable conventions, secret handling, and branch flow.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/.env.development` | New | Dev environment variables (placeholder) |
| `apps/web/.env.stage` | New | Stage environment variables (placeholder) |
| `apps/web/.env.production` | New | Production environment variables (placeholder) |
| `apps/web/next.config.ts` | Modified | Added `validateEnv()` blocking build on missing config |
| `.github/workflows/ci.yml` | New | CI pipeline for PR validation |
| `.github/workflows/deploy-stage.yml` | New | Staging deploy on push to `stage` |
| `.github/workflows/deploy-production.yml` | New | Production deploy on push to `production` |
| `.gitignore` | Modified | Exceptions for tracked `.env.*` files |
| `apps/web/.gitignore` | Modified | Exceptions for tracked `.env.*` files |
| `docs/environments.md` | New | Environment variable reference |
| `docs/branch-strategy.md` | New | Branching model and flow documentation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Vercel as deploy provider is assumed but not confirmed by product | Medium | **RESOLVED** — Team confirmed Vercel as the deployment provider. Workflows remain valid. |
| Placeholder detection in `next.config.ts` blocks intentional local testing with dummy values | Low | Use real local Supabase project or override with `SKIP_ENV_VALIDATION` if added |
| Server-side Supabase secrets omitted from this phase | Low | `SUPABASE_SERVICE_ROLE_KEY` is intentionally deferred until server-side Supabase operations are implemented |
| No staging/production Supabase project exists yet — env files contain only placeholders | Medium | Acceptable for MVP; real values injected via GitHub Actions vars before first real deploy |

## Rollback Plan

1. `git revert` the three infra commits on `feat/infra-cicd`
2. Remove `.github/workflows/` deploy and CI files
3. Restore `next.config.ts` to bare config (remove `validateEnv()`)
4. Delete `.env.*` files and revert `.gitignore` exceptions
5. Remove `docs/environments.md` and `docs/branch-strategy.md`

## Dependencies

- Branch `production` must exist (created by `monorepo-init` change)
- Vercel project must be linked (`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` as GitHub secrets)
- Real Supabase project URLs and keys for each environment (before first real deploy)

## Success Criteria

- [ ] Push PR → CI runs lint, format check, typecheck, build; CI passes
- [ ] Push to `stage` → staging deploy workflow succeeds (once Vercel secrets are configured)
- [ ] Push to `production` → production deploy workflow succeeds
- [ ] Build with missing `NEXT_PUBLIC_SUPABASE_URL` crashes with explicit error
- [ ] Build with placeholder `"dev-placeholder"` values crashes with explicit error
- [ ] Env file documentation matches actual variable names and conventions
