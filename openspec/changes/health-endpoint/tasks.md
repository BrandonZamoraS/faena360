# Tasks: Health Endpoint

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 85–120 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full health endpoint with docs | PR 1 | Single PR to development; tests via lint/typecheck/build + manual |

## Phase 1: Foundation

- [x] 1.1 Create `apps/web/app/api/health/route.ts` with `export const dynamic = "force-dynamic"` and `GET()` skeleton returning `{ status: "healthy", timestamp, checks: { app: "ok", database: "ok" }, build: { version: "" } }`
- [x] 1.2 Define `HealthResponse` type and `HealthCheckResult` type in `route.ts` matching the design contract

## Phase 2: Core Implementation

- [x] 2.1 Implement database connectivity check using native `fetch` to `NEXT_PUBLIC_SUPABASE_URL/rest/v1/tenants?select=id&limit=1` with `NEXT_PUBLIC_SUPABASE_ANON_KEY` header and `AbortController` timeout (~5s)
- [x] 2.2 Implement build identity extraction: read `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_DEPLOY_ID`, fallback to `package.json` version via `process.env` or static import
- [x] 2.3 Map DB check failure/timeout to HTTP 503 with `status: "unhealthy"` and `checks.database: "error"`; success to HTTP 200 with `status: "healthy"` and `checks.database: "ok"`
- [x] 2.4 Ensure response never exposes Supabase URL, keys, exception messages, tenant IDs, row data, IPs, or SQL details — return only `status`, `timestamp`, `checks`, and `build`

## Phase 3: Documentation

- [x] 3.1 Add `/api/health` contract section to `docs/environments.md`: endpoint path, HTTP 200/503 behavior, response shape, Vercel metadata fallback, no service-role key requirement

## Phase 4: Verification

- [x] 4.1 Run `pnpm --filter @faena360/web lint` — must pass with zero errors
- [x] 4.2 Run `pnpm --filter @faena360/web typecheck` — must pass with zero errors
- [x] 4.3 Run `pnpm --filter @faena360/web build` with non-placeholder Supabase env — must succeed
- [x] 4.4 Manual integration: `pnpm --filter @faena360/web dev`, call `/api/health` with valid local Supabase env, verify HTTP 200 and JSON shape
- [x] 4.5 Manual integration: repeat with invalid `NEXT_PUBLIC_SUPABASE_URL`, verify HTTP 503 and `checks.database: "error"` — no secrets leaked
