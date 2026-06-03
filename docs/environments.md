# Environment Configuration

## Environments

- **development**: Local development and integration branch.
- **stage**: Pre-production validation environment.
- **production**: Live user-facing environment.

## Required Variables

The following variables MUST be configured for every environment. Build and deploy will fail explicitly if any are missing.

| Variable                        | Scope  | Description                       |
| ------------------------------- | ------ | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public | Supabase project URL              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous/public API key |

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

`SUPABASE_SERVICE_ROLE_KEY` is intentionally out of scope for this change. Add it only when server-side Supabase operations are implemented.
