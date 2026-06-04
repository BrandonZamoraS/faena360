# Delta for Infraestructura Base

**Change**: infra-cicd
**Status**: Retroactive — implementation exists on `feat/infra-cicd`

## ADDED Requirements

### Requirement: CI validation on pull requests

The system MUST run automated lint, format check, typecheck, and build validation on every pull request targeting `development`, `stage`, or `production`. The CI pipeline MUST use dummy environment values that satisfy build-time validation without exposing real secrets.

#### Scenario: PR validation passes with complete code

- GIVEN a pull request targeting `development`, `stage`, or `production`
- WHEN the CI workflow runs
- THEN lint, format check, typecheck, and build all pass before merge consideration

#### Scenario: PR fails lint or typecheck

- GIVEN a pull request with linting or type errors
- WHEN the CI workflow runs
- THEN the pipeline fails and the PR cannot merge until errors are resolved

### Requirement: Automated deployment to staging and production

The system MUST deploy automatically on push to designated release branches. Pushes to `stage` MUST deploy to the staging environment. Pushes to `production` MUST deploy to the production environment. Both deployments MUST use prebuilt deployment via the Vercel CLI, pulling secrets from GitHub Actions environment configuration.

#### Scenario: Push to stage triggers staging deploy

- GIVEN valid `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets are configured
- WHEN a commit is pushed to the `stage` branch
- THEN the staging deploy workflow runs and deploys to the staging environment

#### Scenario: Push to production triggers production deploy

- GIVEN valid Vercel secrets are configured
- WHEN a commit is pushed to the `production` branch
- THEN the production deploy workflow runs and deploys to the production environment

#### Scenario: Deploy fails when Vercel secrets are missing

- GIVEN `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or `VERCEL_PROJECT_ID` is not configured
- WHEN a deployment workflow runs
- THEN the workflow fails before completing the deploy

### Requirement: Environment variable files per environment

The system MUST provide separate `.env.development`, `.env.stage`, and `.env.production` files under `apps/web/` containing at minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These files MUST be tracked in version control with placeholder values. Real values MUST be injected via GitHub Actions variables or Vercel environment configuration, never committed as secrets.

#### Scenario: Developer starts local development

- GIVEN the repository is cloned
- WHEN the developer opens `apps/web/.env.development`
- THEN `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present with placeholder values and clear comments

#### Scenario: Real values are never committed

- GIVEN a developer has real Supabase credentials
- WHEN they configure their local environment
- THEN real credentials are stored in GitHub Actions variables or Vercel environment settings, never in tracked `.env.*` files

## MODIFIED Requirements

### Requirement: Environment-safe delivery

The system MUST support separate `development`, `stage`, and `production` environments. The build or deployment process MUST fail explicitly when critical configuration is missing or contains placeholder values. Pull requests MUST run lint, format check, typecheck, and build validation before merge consideration. Stage/production deployments MUST follow their designated release branches via automated GitHub Actions workflows using Vercel CLI prebuilt deployment, pulling secrets from GitHub Actions environment configuration.

(Previously: The system MUST support separate environments. The build or deployment process MUST fail explicitly when critical configuration is missing. Pull requests MUST run lint and build validation before merge consideration, and stage/production deployments MUST follow their designated release branches.)

#### Scenario: Missing critical configuration blocks delivery

- GIVEN a build or deployment with missing required variables
- WHEN the pipeline starts validation
- THEN the build fails with an explicit configuration error before release, specifically rejecting values that contain "placeholder"

#### Scenario: Placeholder values block production delivery

- GIVEN a deployment attempt with `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` containing "placeholder"
- WHEN the build process runs
- THEN the process fails with `[CRITICAL CONFIG ERROR]` before any deployment step

#### Scenario: CI uses safe dummy values for build validation

- GIVEN a pull request CI run
- WHEN the build step executes
- THEN `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are provided as dummy values that satisfy validation without exposing real secrets