# Proposal: Health Endpoint

## Intent

Add a public `GET /api/health` endpoint so deployments, operators, and n8n can verify runtime reachability and basic Supabase/Postgres connectivity without exposing secrets.

## Scope

### In Scope
- Add `GET /api/health` in the Next.js App Router app.
- Return stable technical status for app, database, and build/deploy identity.
- Keep the payload public, minimal, and safe for automated polling.

### Out of Scope
- Auth, tenant context, or business-domain checks.
- Deep diagnostics, latency metrics, or service-role verification.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None.

## Approach

Implement one Route Handler at `apps/web/app/api/health/route.ts` with `force-dynamic`. It returns timestamped health data and performs a lightweight Supabase/Postgres reachability check using existing public Supabase env vars. Use commit SHA, package version, or deploy identifier already available at build/deploy time.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/api/health/route.ts` | New | Public health Route Handler |
| `apps/web/package.json` | Modified | Add explicit Supabase client dependency if required |
| `apps/web/next.config.ts` | Modified | Keep runtime-safe env validation aligned with endpoint needs |
| `docs/environments.md` | Modified | Document health contract/env assumptions if needed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DB check slows monitoring | Low | Use one lightweight connectivity query and short timeout |
| Endpoint leaks internals | Low | Return only status, timestamp, and version/deploy identity |
| Static optimization breaks freshness | Low | Mark route dynamic |

## Rollback Plan

Revert the health route and any related dependency/config changes; monitoring falls back to HTTP reachability only until a corrected endpoint is redeployed.

## Dependencies

- Existing Supabase URL/anon key configuration in `apps/web`
- Vercel/build metadata already exposed by deployment

## Success Criteria

- [ ] `GET /api/health` returns HTTP 200 when app and DB are reachable, otherwise unhealthy/503.
- [ ] Response is stable for n8n polling and contains no secrets or sensitive infrastructure details.
