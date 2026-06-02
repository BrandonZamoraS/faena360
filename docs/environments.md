# Environment Configuration

## Environments

- **development**: Local development and integration branch.
- **stage**: Pre-production validation environment.
- **production**: Live user-facing environment.

## Required Variables

The following variables MUST be configured for every environment. Build and deploy will fail explicitly if any are missing.

| Variable                        | Scope  | Description                                  |
| ------------------------------- | ------ | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public | Supabase project URL                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous/public API key            |
| `SUPABASE_SERVICE_ROLE_KEY`     | Secret | Supabase service role key (server-side only) |

## File Locations

- `apps/web/.env.development` — Development values
- `apps/web/.env.stage` — Staging values
- `apps/web/.env.production` — Production values

## Secrets

Never commit secrets. Store them in:

- GitHub Repository Secrets (`Settings > Secrets and variables > Actions`)
- Vercel Environment Variables (if using Vercel Git integration)

## GitHub Actions Variables

For deployment workflows, set these as **repository variables** (non-secret):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

And these as **repository secrets**:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `SUPABASE_SERVICE_ROLE_KEY` (when server-side Supabase operations are added)
