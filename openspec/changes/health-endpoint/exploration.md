## Exploration: GET /api/health

### Current State

`apps/web/` uses Next.js App Router and had no API routes before this change. `infraestructura-base` already requires technical health visibility for app availability, Supabase/Postgres reachability, and deploy identity. GitHub issue #3 covers this requirement and unlocks n8n/Telegram monitoring.

Relevant context:
- Existing env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- No test runner is configured; verification relies on lint, typecheck, build, and manual runtime checks.
- Vault API docs still had a simple `{ status: "ok" }` shape, so response contract needs alignment.

### Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/api/health/route.ts` | New | Public `GET /api/health` Route Handler. |
| `docs/environments.md` | Modified | Documents contract, env behavior, and security notes. |
| `openspec/changes/health-endpoint/` | New | SDD proposal, design, tasks, and verification evidence. |

### Approaches

1. **Minimal static response** — Return status/timestamp only.
   - Pros: trivial, no DB call.
   - Cons: misses Supabase/Postgres acceptance criterion.
   - Effort: Low.

2. **Route Handler with native Supabase REST check** — Use `fetch` against Supabase REST with anon key and timeout.
   - Pros: satisfies MVP health requirement, no new dependency, stable for n8n, small scope.
   - Cons: validates Supabase REST/PostgREST/Postgres reachability, not authenticated business access.
   - Effort: Low/Medium.

3. **Application-layer health service** — Extract a health service into workspace packages.
   - Pros: more abstraction and test seams.
   - Cons: over-engineered for infrastructure monitoring in the MVP phase.
   - Effort: Medium.

### Recommendation

Use approach 2: a single dynamic Next.js Route Handler with native `fetch`, safe response mapping, and docs. This is enough for MVP infrastructure monitoring and keeps the review small.

### Risks

- Public endpoint could leak internals if too verbose; mitigate by returning only status, timestamp, checks, and build identity.
- DB timeout could slow polling; mitigate with `AbortController` timeout.
- Vault API docs may drift from implemented contract; track as documentation follow-up.

### Ready for Proposal

Yes. The change is small, implementation-focused, and fits the 400-line review budget when artifacts stay concise.
