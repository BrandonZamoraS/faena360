# Environment Configuration

## Environments

- **development**: Local development and integration branch.
- **stage**: Pre-production validation environment.
- **production**: Live user-facing environment.

## Required Variables

The following variables MUST be configured for every environment. Build and deploy will fail explicitly if any are missing.

| Variable                        | Scope  | Description                                      |
| ------------------------------- | ------ | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public | Supabase project URL                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous/public API key                |
| `APP_SESSION_SECRET`            | Secret | HMAC secret for signed app-session cookies       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Secret | Server-only key for auth/session state refreshes |

## File Locations

- `apps/web/.env.example` — Template with placeholder variable names (tracked, safe to commit)
- `apps/web/.env.local` — Local development values (ignored by git, never commit real values)
- Vercel Dashboard — Stage and production values (set as environment variables)

## Local Setup

```bash
# Copy the example file and fill in your real Supabase credentials
cp apps/web/.env.example apps/web/.env.local
```

`.env.local` is ignored by git. Never commit real credentials to any tracked file.

## Secrets

Never commit secrets. Store them in:

- Vercel Environment Variables (if using Vercel Git integration)
- GitHub Repository Secrets (`Settings > Secrets and variables > Actions`) — only for CI/CD workflows

## GitHub Actions Variables

For deployment workflows, set these as **repository variables** (non-secret):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

And these as **repository secrets**:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `APP_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is required only on the server. Never expose it with a `NEXT_PUBLIC_` prefix.

## Health Endpoint

`GET /api/health` is a public, unauthenticated endpoint for runtime and monitoring checks.

**HTTP behavior:**

- `200` — app and database are reachable (`status: "healthy"`).
- `503` — Supabase/Postgres connectivity failed or timed out (`status: "unhealthy"`).

**Response shape:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "checks": { "app": "ok", "database": "ok" },
  "build": {
    "version": "0.1.0",
    "commit_sha": "abc123",
    "deploy_id": "dpl_xyz"
  }
}
```

**Build identity fallback:**

| Field        | Source                                                         |
| ------------ | -------------------------------------------------------------- |
| `version`    | `apps/web/package.json`                                        |
| `commit_sha` | `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` or `VERCEL_GIT_COMMIT_SHA` |
| `deploy_id`  | `NEXT_PUBLIC_VERCEL_DEPLOY_ID` or `VERCEL_DEPLOYMENT_ID`       |

`commit_sha` and `deploy_id` are omitted when unavailable (e.g., local development).

**Database check:** Uses native `fetch` to Supabase REST (`/rest/v1/tenants?select=id&limit=1`) with the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No service-role key or `@supabase/supabase-js` dependency is required. RLS returns no tenant data because no user JWT is used — the check only proves Supabase API and Postgres path are reachable.

**Security:** The response never exposes Supabase URLs, API keys, error messages, tenant data, IPs, or SQL details.
