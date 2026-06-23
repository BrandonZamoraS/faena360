# Plan: Issue #68 WhatsApp inbound identity

This plan keeps Faena360 responsible for identity resolution, tenant/capability validation, and the internal API contract. n8n remains responsible for provider-specific ingestion, conversation state, and user-facing message translation.

## Molecular Spec: issue-68-whatsapp-identify

### Source Inputs
- Issue/request: present — inbound WhatsApp message must resolve an operative user by globally unique phone without persisting conversation state in Faena360.
- Primary docs: `obsidian-vault/01-producto/enunciado-sistema/01-enunciado-parte-1.md`, `09-enunciado-parte-9.md`, `10-enunciado-parte-10.md`, `12-enunciado-parte-12.md`; `obsidian-vault/08-whatsapp-n8n/payloads-api.md`, `validaciones.md`; `obsidian-vault/04-specs/mvp/1.4-whatsapp-n8n-minimo.md`; `obsidian-vault/05-arquitectura/arquitectura-general.md`; `openspec/specs/authorization-base/spec.md`; `openspec/specs/effective-capabilities/spec.md`.
- Targeted code checked: `apps/web/app/api/auth/login/handler.ts`, `apps/web/app/api/auth/me/handler.ts`, `apps/web/lib/auth/session.ts`, `packages/application/src/auth/app-session.ts`, `packages/application/src/auth/effective-capabilities.ts`, `packages/infrastructure/src/auth/SupabaseAppSessionRepository.ts`, `packages/infrastructure/src/auth/SupabaseUserManagementRepository.ts`, `supabase/migrations/20250630000000_issue_27_tenant_user_constraints.sql`, `supabase/migrations/20260616000000_issue_25_identifier_exists_exclude.sql`, `supabase/scripts/default-role-bootstrap.ts`.

### Intended Behavior
Faena360 SHALL expose an internal webhook endpoint that accepts a normalized inbound WhatsApp message from n8n, resolves the user by globally unique phone, verifies tenant status, verifies active user status, verifies the user belongs to an operational WhatsApp role, resolves effective capabilities for that tenant/user pair, and returns only the identity/context n8n needs to continue the conversation. Faena360 SHALL NOT persist WhatsApp sessions, incomplete flows, or operational records in this issue.

### Capability / Domain
WhatsApp/n8n inbound identity resolution across authorization, multitenant isolation, and effective capability resolution.

### Acceptance Scenarios
- GIVEN a normalized phone that belongs to an active operative user in an active tenant WHEN n8n calls the identify endpoint THEN the API returns `userIdentified: true` plus `userId`, `userName`, `tenantId`, `roles`, and effective `capabilities`.
- GIVEN a phone that is missing or unknown WHEN n8n calls the endpoint THEN the API returns a controlled `USUARIO_NO_REGISTRADO` response without exposing internal existence details.
- GIVEN an inactive user or inactive tenant WHEN n8n calls the endpoint THEN the API rejects with `USUARIO_INACTIVO` or `TENANT_INVALIDO`.
- GIVEN an admin/supervisor or a user without allowed operational capability WHEN n8n calls the endpoint THEN the API rejects with `ROL_NO_WHATSAPP` or `PERMISO_DENEGADO`.
- GIVEN a valid request WHEN the endpoint completes THEN no WhatsApp session table, incomplete-flow table, or operational record is created.

### Minimal Affected Areas
- `apps/web/app/api/webhooks/whatsapp/identify/` — new internal Route Handler and HTTP contract.
- `apps/web/lib/` or `packages/shared/` — webhook HMAC verification helper, if kept at the delivery boundary.
- `packages/application/src/whatsapp/` — use case for phone-based identity resolution and policy checks.
- `packages/infrastructure/src/auth/` or `packages/infrastructure/src/whatsapp/` — Supabase-backed lookup for user, roles, tenant, and capabilities.
- `supabase/tests/` — SQL verification for normalized phone uniqueness assumptions only if current coverage needs extension.
- `openspec/changes/issue-68-whatsapp-identify/` — this planning artifact.

### Risks
- The repo has no existing internal webhook auth helper; HMAC must be introduced cleanly instead of inventing ad-hoc header checks.
- Default operational roles currently have empty capability grants in `supabase/scripts/default-role-bootstrap.ts`; identity may succeed before later WhatsApp actions have usable capability sets unless the owner confirms the capability keys expected for phase 1.4/1.5.
- `obsidian-vault/08-whatsapp-n8n/payloads-api.md` includes `tenantId`/`userId` in general n8n→API payloads, but this issue's identify step must resolve them server-side from phone first.

### Owner Questions
- Which exact capability key(s) should gate “allowed operational WhatsApp role” at identification time: channel access only, or the first action-specific capability set already planned for 1.5+?
- Should inactive/unknown users both map to the same external-friendly message in n8n, while Faena360 still returns distinct internal error codes? (Docs currently support that pattern.)

### Ready for Design
Yes — implementation can proceed once the owner confirms the capability gate for operative WhatsApp access.

## Goal

Plan the minimum Faena360 work needed so n8n can identify the operative user behind an inbound WhatsApp message and continue the conversation with tenant/role/capability context.

## Non-goals

- Implement n8n workflows, prompts, provider setup, or conversation memory.
- Create Supabase Edge/Deno Functions by default; the current repo pattern is Next.js Route Handlers, and no `supabase/functions/` implementation exists yet.
- Persist WhatsApp sessions, incomplete flows, or operational records.
- Implement 1.5/1.6/1.8 business actions.

## Dependency Check

All stated dependencies are already closed in GitHub and available to build on:

| Issue | Status | Relevance |
|---|---|---|
| #16 | Closed | RLS/multitenant isolation baseline exists. |
| #17 | Closed | Authorization schema and global phone uniqueness exist. |
| #19 | Closed | Base tenant roles exist, including `is_web_access` separation. |
| #20 | Closed | App-session and effective-capability resolution patterns already exist. |

## Repo scope vs n8n scope

| Area | Faena360 repo scope | n8n scope |
|---|---|---|
| Provider ingestion | None beyond normalized contract | Receive Meta/Twilio/etc. webhook and normalize payload |
| Authentication | Verify internal webhook secret/signature | Sign requests with shared secret and fresh timestamp |
| Identity resolution | Lookup by normalized `user_profiles.phone` | Send normalized phone only |
| Tenant resolution | Resolve from matched user profile and tenant row | Do not guess tenant |
| Authorization | Validate active user, active tenant, WhatsApp-eligible role, effective capabilities | Use returned capabilities to shape the conversation |
| Conversation memory | None | Own memory/context/Postgres chat memory |
| User-facing messages | Return machine-readable codes/messages | Translate codes to operator-friendly replies |
| Operational record creation | Out of scope in this issue | Out of scope in this issue |

## Proposed endpoint contract

### Route

`POST /api/webhooks/whatsapp/identify`

### Request body

```json
{
  "phone": "+54 9 11 1234-5678",
  "text": "Hola",
  "timestamp": "2026-06-22T10:00:00Z",
  "provider": "meta",
  "provider_message_id": "wamid.123"
}
```

### Auth proposal

- Header `X-Faena-Timestamp`: ISO-8601 or epoch milliseconds.
- Header `X-Faena-Signature`: lowercase hex HMAC-SHA256 of `${timestamp}.${rawBody}` using the shared secret.
- Server MUST reject missing/invalid signatures and stale timestamps.
- This matches the 1.4 technical spec and is the closest current source of truth; no conflicting repo pattern was found.

### Success response proposal

```json
{
  "userIdentified": true,
  "userId": "uuid",
  "userName": "Juan Pérez",
  "tenantId": "uuid",
  "roles": ["operador"],
  "capabilities": ["shifts:start", "shifts:close"]
}
```

### Controlled error response proposal

```json
{
  "userIdentified": false,
  "errorCode": "USUARIO_NO_REGISTRADO",
  "message": "Controlled identity rejection."
}
```

### Suggested HTTP mapping

| Error | HTTP | Note |
|---|---|---|
| `USUARIO_NO_REGISTRADO` | 404 | Safe for n8n; do not leak tenant/user internals |
| `USUARIO_INACTIVO` | 403 | Internal code can remain distinct even if n8n shows generic text |
| `ROL_NO_WHATSAPP` | 403 | Admin/supervisor or any non-operative-only role set |
| `TENANT_INVALIDO` | 403 | Tenant missing/inactive |
| `PERMISO_DENEGADO` | 403 | Role exists but effective capability gate fails |
| invalid HMAC / timestamp | 401 | Infra/security failure, not business rejection |

## Data model assumptions

- `user_profiles.phone` is globally unique after normalization to digits (`normalize_identifier_phone`).
- `user_profiles.status` and `tenants.status` are the authoritative active/inactive flags.
- `roles.is_web_access = false` is a structural signal for WhatsApp-only operational roles, but it is NOT sufficient by itself; capabilities still govern allowed actions.
- Effective capabilities are already resolved by `createEffectiveCapabilitiesResolver` and can be reused instead of inventing a WhatsApp-specific permission engine.
- No new tables are required for this issue.

## Validation and permission rules

1. Normalize `phone` with the same digit-only logic already used for uniqueness.
2. Validate webhook signature/timestamp before any lookup.
3. Find the user by normalized phone using service-role-backed server code.
4. Reject when no user matches.
5. Reject when `user_profiles.status != active`.
6. Load and validate `tenants.status == active`.
7. Load assigned roles for that tenant/user.
8. Reject when the user is not part of an operational WhatsApp-eligible role set.
9. Resolve effective capabilities for the same tenant/user pair.
10. Reject when the required WhatsApp capability gate is absent.
11. Return only identity/context data; do not create business records.

## Implementation sequence for later `sdd-apply`

### Slice 1 — Contract + security boundary
- Add the new Route Handler skeleton.
- Parse raw body and validate HMAC/timestamp.
- Add route-level tests for auth failures and malformed payloads.

### Slice 2 — Identity resolution use case
- Add an application use case that resolves user + tenant + roles + effective capabilities by phone.
- Add an infrastructure repository using existing auth/session query patterns.
- Add unit tests for success, unknown phone, inactive user, inactive tenant, disallowed role, and missing capability.

### Slice 3 — Endpoint integration + docs/verification
- Wire the route to the use case and HTTP/error mapping.
- Add/update OpenSpec verification notes and any minimal docs needed for n8n consumers.
- Run repo verification commands plus manual request checks.

## Test and verification plan

- Unit: use case outcome mapping for the five controlled rejections and success path.
- Unit: route auth/payload validation.
- Quality: `pnpm lint`, `pnpm -r typecheck`, `pnpm test`.
- Manual API checks with signed requests for: success, unknown phone, inactive user, inactive tenant, admin/supervisor, missing capability, bad signature.
- Regression check: confirm no new table/migration is introduced unless implementation proves a DB helper is truly necessary.

## Manual QA

1. Send a signed request with a known operative phone and confirm identity, tenant, roles, and capabilities are returned.
2. Send a signed request with an unknown phone and confirm controlled rejection without internal details.
3. Use an inactive user and confirm `USUARIO_INACTIVO`.
4. Use a user in an inactive tenant and confirm `TENANT_INVALIDO`.
5. Use an admin/supervisor number and confirm `ROL_NO_WHATSAPP`.
6. Use an operative user missing the agreed capability and confirm `PERMISO_DENEGADO`.
7. Inspect the DB and confirm no WhatsApp session/conversation/business tables received new rows.

## Review workload forecast

- Expected implementation size if kept minimal: ~250–380 changed lines including route, auth helper, use case, repository wiring, and tests.
- Risk of exceeding 400 lines: medium, mainly if the HMAC helper, capability gate abstraction, and tests are all added in one PR.
- Chained PR recommendation: not mandatory at plan time, but be ready to split if the security boundary and identity resolution logic together push the diff past the 400-line review budget.

## Notes for the owner

- Owner decision (2026-06-22): implement the Faena360 boundary as a Next.js Route Handler, not Deno/Supabase Edge Functions. n8n remains out of repo scope; this change documents n8n's required behavior but creates no n8n workflows/files.
- The repo currently points toward Next.js Route Handlers, not Deno functions. If you WANT this in a Supabase Edge Function later, that is a separate architectural decision, not the current documented default.
- The most important product decision still pending is the exact capability key that means “this operative can proceed through WhatsApp.” Without that, the endpoint can identify the user but the permission gate stays fuzzy.
