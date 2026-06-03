# Design: Configurar ambientes, variables y CI/CD

**GitHub Issue**: #6 | **Branch**: `feat/infra-cicd` | **Retroactive**: Yes

## Technical Approach

Implement environment-safe delivery for Faena360 by establishing three per-environment configuration files, build-time critical validation, and GitHub Actions CI/CD workflows using Vercel CLI prebuilt deployment. This maps directly to the "Environment-safe delivery" requirement in `infraestructura-base`.

The design follows a fail-fast philosophy: builds crash early if required environment variables are missing or contain placeholder values, and CI validates code quality before any merge.

## Architecture Decisions

### Decision: Vercel CLI prebuilt deployment

**Choice**: Use `npx vercel pull` → `npx vercel build` → `npx vercel deploy --prebuilt` in GitHub Actions
**Alternatives considered**: (1) Vercel Git integration (auto-deploy on push), (2) Docker-based deployment
**Rationale**: Prebuilt deployment gives explicit control over build environment variables (injected via GitHub Actions vars/secrets), ensures CI and deploy use the same build artifact, and avoids Vercel's opaque Git integration which would bypass our `validateEnv()` gate. **CONFIRMED**: Vercel is the deployment provider — confirmed by the team. The enunciado does not specify a provider; this decision was ratified post-implementation.

### Decision: Build-time env validation in next.config.ts

**Choice**: `validateEnv()` function at module top-level that throws `[CRITICAL CONFIG ERROR]` on missing or placeholder values
**Alternatives considered**: (1) Runtime validation in a Next.js middleware, (2) Schema validation with `zod`
**Rationale**: Build-time validation catches misconfiguration before deployment, not after. The "placeholder" substring check prevents accidental deploy with dev template values. Module-level execution ensures the check runs before any Next.js initialization.

### Decision: Tracked .env files with placeholders

**Choice**: Commit `.env.development`, `.env.stage`, `.env.production` with placeholder values; adjust `.gitignore` to allow these specific files
**Alternatives considered**: (1) `.env.example` only with real values in CI, (2) No committed env files
**Rationale**: Committed env files with placeholders provide discoverability (developers see what variables are needed) while `.gitignore` exceptions ensure only these three are tracked. Real values are always injected via GitHub Actions vars or Vercel environment settings.

### Decision: Four-branch flow (feature → development → stage → production)

**Choice**: Document and enforce a linear merge flow through three protected branches
**Alternatives considered**: (1) Trunk-based development with feature flags, (2) GitFlow with release branches
**Rationale**: The three-environment setup maps cleanly to three long-lived branches. Feature branches merge to `development`, promotion to `stage` triggers staging deploy, and promotion to `production` triggers production deploy.

## Data Flow

```
PR → development  ──CI──→  Lint + Format + Typecheck + Build (dummy env)
                                         │
Push to stage  ──Deploy──→  Vercel pull → Build (stage vars) → Deploy --prebuilt → Staging URL
                                         │
Push to production  ──Deploy──→  Vercel pull → Build (prod vars) → Deploy --prebuilt --prod → Production URL
```

CI workflow injects `NEXT_PUBLIC_SUPABASE_URL=ci-check.supabase.co` to satisfy `validateEnv()` without real secrets. Deploy workflows inject real values from `vars.NEXT_PUBLIC_*` (GitHub Actions variables, non-secret) and `secrets.VERCEL_*` (GitHub Actions secrets).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | Create | CI: lint, format check, typecheck, build on PRs |
| `.github/workflows/deploy-stage.yml` | Create | Staging deploy on push to `stage` via Vercel CLI |
| `.github/workflows/deploy-production.yml` | Create | Production deploy on push to `production` via Vercel CLI |
| `apps/web/.env.development` | Create | Dev env vars with placeholder Supabase credentials |
| `apps/web/.env.stage` | Create | Stage env vars with placeholder Supabase credentials |
| `apps/web/.env.production` | Create | Production env vars with placeholder Supabase credentials |
| `apps/web/next.config.ts` | Modify | Add `validateEnv()` blocking build on missing/placeholder config |
| `.gitignore` | Modify | Add exceptions for tracked `.env.development`, `.env.stage`, `.env.production` |
| `apps/web/.gitignore` | Modify | Same exceptions at app level |
| `docs/environments.md` | Create | Environment variable reference and secret handling guide |
| `docs/branch-strategy.md` | Create | Branch model, flow, and rules documentation |

## Interfaces / Contracts

```typescript
// apps/web/next.config.ts — build-time validation contract
interface RequiredEnvVars {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

// Validates at build time:
// - Variable must exist in process.env
// - Value must NOT contain "placeholder" substring
// - Throws [CRITICAL CONFIG ERROR] and halts build on violation
```

```yaml
# GitHub Actions required secrets (per environment)
VERCEL_TOKEN: string           # Vercel personal access token
VERCEL_ORG_ID: string          # Vercel organization ID
VERCEL_PROJECT_ID: string      # Vercel project ID

# GitHub Actions required variables (non-secret, per environment)
NEXT_PUBLIC_SUPABASE_URL: string      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY: string # Supabase anon/public key
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `validateEnv()` rejects missing vars | Remove env var, run `next build`, expect crash |
| Unit | `validateEnv()` rejects placeholder values | Set URL to `dev-placeholder.supabase.co`, expect crash |
| Integration | CI workflow passes on valid code | Push PR, verify all CI steps pass |
| Integration | CI workflow fails on lint/type errors | Push bad code, verify CI fails |
| Integration | Staging deploy succeeds with real secrets | Push to `stage`, verify deploy completes (requires Vercel configured) |
| Integration | Production deploy succeeds with real secrets | Push to `production`, verify deploy completes |
| E2E | Deployed app is reachable | After deploy, curl app URL, verify HTTP 200 |

## Migration / Rollout

No database migration required. Rollback is via `git revert` of the three infra commits. First real deployment requires:
1. Create Vercel project, obtain `ORG_ID` and `PROJECT_ID`
2. Configure GitHub repository secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`)
3. Configure GitHub repository variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) per environment
4. Create Supabase projects for staging and production

## Open Questions

- [x] **Deploy provider confirmation**: Vercel is confirmed by the team as the deployment provider.
- [x] **SUPABASE_SERVICE_ROLE_KEY**: Intentionally deferred until server-side Supabase operations are implemented.
- [ ] **Health endpoint**: The `infraestructura-base` spec requires `GET /api/health`, but this change does not implement it. Should it be a separate change?
- [ ] **Branch protection rules**: Should `development`, `stage`, and `production` have GitHub branch protection rules requiring CI pass before merge?
