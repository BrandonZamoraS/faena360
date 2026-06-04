# Design: Health Endpoint

## Technical Approach

Create a public Next.js App Router Route Handler at `apps/web/app/api/health/route.ts`. The handler stays infrastructure-only: it reports app reachability, a lightweight Supabase/PostgREST-backed database reachability check, and deployment identity without auth, tenant context, business data, or secrets. It maps to `infraestructura-base` technical health visibility and keeps the response stable for n8n polling.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Route placement/runtime | `apps/web/app/api/health/route.ts` with `export const dynamic = "force-dynamic"` and `GET()` | Page route, middleware, static response | Matches existing Next.js 16 App Router convention from vault API docs and prevents stale health data. |
| DB connectivity | Use native `fetch` to Supabase REST: `/rest/v1/tenants?select=id&limit=1`, with existing `NEXT_PUBLIC_SUPABASE_URL` and anon key headers, plus a short abort timeout | Add `@supabase/supabase-js`; service-role key; raw SQL/RPC | Avoids a new dependency and new secrets. A successful PostgREST response proves Supabase API/Postgres path is reachable; RLS returns no tenant data because no user JWT is used. |
| Response contract | Stable JSON with `status`, `timestamp`, `checks`, and `build` object | Vault's current `{ status: "ok" }` only; verbose diagnostics | Satisfies the richer OpenSpec requirement while preserving public safety and n8n-friendly status fields. |
| Build identity | Prefer Vercel metadata env (`VERCEL_GIT_COMMIT_SHA` / `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `VERCEL_DEPLOYMENT_ID` / `NEXT_PUBLIC_VERCEL_DEPLOY_ID`), fallback to package version | Require deploy timestamp env | No new required env. Timestamp in response is request time; deploy identity is commit/deploy/version. |

## Data Flow

```text
n8n / operator ──GET /api/health──> Next Route Handler
                                   ├─ app check: in-process ok
                                   ├─ db check: Supabase REST tenants HEAD-like read
                                   └─ build identity: env/package version
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/app/api/health/route.ts` | Create | Public health Route Handler, dynamic runtime, timeout-bound Supabase connectivity check, safe JSON response. |
| `docs/environments.md` | Modify | Document `/api/health` contract, Vercel metadata fallback, and that no service-role secret is required. |

No `apps/web/package.json` change is required because native `fetch` is sufficient. No `next.config.ts` change is required because existing Supabase public env validation already covers build/deploy requirements.

## Interfaces / Contracts

```ts
type HealthResponse = {
  status: "healthy" | "unhealthy";
  timestamp: string; // ISO 8601 request time
  checks: { app: "ok"; database: "ok" | "error" };
  build: {
    version: string;
    commit_sha?: string;
    deploy_id?: string;
  };
};
```

HTTP behavior:
- `200` when app and database checks pass.
- `503` when Supabase/Postgres connectivity fails or times out.
- Never return Supabase URL, keys, exception messages, tenant IDs, row data, IPs, or SQL details.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static | Route compiles and response type is valid | `pnpm --filter @faena360/web lint` and `pnpm --filter @faena360/web typecheck`. |
| Build | Production build accepts required env vars | `pnpm --filter @faena360/web build` with non-placeholder Supabase public env values. |
| Manual integration | Healthy/unhealthy status | Run `pnpm --filter @faena360/web dev`, call `/api/health` with valid local Supabase env; repeat with invalid URL/key expecting `503`. |
| Monitoring readiness | n8n can poll stable fields | Verify JSON contains `status`, `checks.database`, `timestamp`, and `build` on both 200 and 503 paths. |

No automated unit/integration/e2e tests are planned because the project currently has no test runner.

## Migration / Rollout

No data migration required. Deploy normally after lint/typecheck/build verification. n8n monitoring can begin polling every two minutes after deployment.

## Open Questions

None.
