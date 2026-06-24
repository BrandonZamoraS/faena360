# Design: Issue #68 WhatsApp inbound identity

Faena360 will expose the identity resolver as a **Next.js Route Handler boundary**. n8n stays outside this repo: it normalizes WhatsApp provider input, signs requests, owns conversation memory, and blocks/retries according to Faena360 response codes.

## Technical Approach

`POST /api/webhooks/whatsapp/identify` accepts one normalized inbound message, validates HMAC before parsing business input, resolves the user globally by normalized phone, validates tenant/user/WhatsApp role/capability, and returns identity context only. No WhatsApp sessions, incomplete flows, or operational records are persisted.

## Architecture Decisions

| Decision | Choice | Tradeoff / rationale |
|---|---|---|
| Delivery boundary | Next.js Route Handler in `apps/web/app/api/webhooks/whatsapp/identify` | Matches existing API pattern; avoids introducing Deno/Supabase Edge Functions for one endpoint. |
| Business logic | Application use case + infrastructure repository | Preserves Clean/Hexagonal pattern already used by auth/session. |
| HMAC | Raw body + timestamp, constant-time compare | Keeps n8n auth local to delivery; application receives trusted input. |
| Replay | Reject stale timestamps >5 min; no nonce store in this issue | Blocks old captures without adding persistence. Replay inside the freshness window remains a known accepted risk because identify is read-only. |
| n8n scope | Manual external contract only | No n8n workflow/files are created in this repo. |

## Module Responsibilities / File Changes

| File | Action | Responsibility |
|---|---|---|
| `apps/web/app/api/webhooks/whatsapp/identify/route.ts` | Create | Next.js POST wrapper. |
| `apps/web/app/api/webhooks/whatsapp/identify/handler.ts` | Create | Raw body read, HMAC/timestamp, JSON validation, HTTP mapping. |
| `apps/web/lib/webhooks/hmac.ts` | Create | Shared internal webhook verifier using `WEBHOOK_WHATSAPP_SECRET` (name final in apply). |
| `packages/application/src/whatsapp/identify.ts` | Create | Use case, ports, result/error types. |
| `packages/application/src/whatsapp/index.ts` | Create | Public exports. |
| `packages/infrastructure/src/whatsapp/SupabaseWhatsappIdentityRepository.ts` | Create | Service-role Supabase lookups by normalized phone, tenant, roles, capabilities. |
| `packages/*/src/index.ts` | Modify | Export whatsapp modules. |
| `*.test.ts` near each module | Create | Unit/integration coverage for slices below. |

## API Contract

### Request

Headers:
- `X-Faena-Timestamp`: epoch milliseconds or ISO-8601 UTC; must be within 5 minutes of server time.
- `X-Faena-Signature`: HMAC-SHA256 over `${timestamp}.${rawBody}` encoded as lowercase hex.

Body:
```json
{
  "phone": "+54 9 11 1234-5678",
  "text": "Hola",
  "type": "text",
  "timestamp": "2026-06-22T10:00:00Z",
  "provider": "meta",
  "provider_message_id": "wamid.123"
}
```

### Success `200`
```json
{
  "userIdentified": true,
  "userId": "uuid",
  "userName": "Juan Pérez",
  "tenantId": "uuid",
  "roles": ["operador"],
  "capabilities": ["shifts:start"]
}
```

### Controlled errors

| Code | HTTP | Meaning |
|---|---:|---|
| `USUARIO_NO_REGISTRADO` | 404 | Phone missing/unknown. |
| `USUARIO_INACTIVO` | 403 | User profile inactive. |
| `TENANT_INVALIDO` | 403 | Tenant missing/inactive. |
| `ROL_NO_WHATSAPP` | 403 | No eligible WhatsApp operational role. |
| `PERMISO_DENEGADO` | 403 | Effective capability gate missing. |
| `PAYLOAD_INVALIDO` | 400 | JSON/body/type invalid; non-text blocked for 1.4. |
| `WEBHOOK_NO_AUTORIZADO` | 401 | Missing/invalid signature or stale timestamp. |

Business error body: `{ "userIdentified": false, "errorCode": "...", "message": "Controlled identity rejection." }`.

## Permission / Capability Gate

Known rule: only `operador`, `mantenimiento`, and `repartidor_de_combustible` use WhatsApp; `roles.is_web_access = false` is necessary but not enough. Recommended minimal safe gate: require an explicit channel capability such as `whatsapp.channel.access` **and** a non-web operational role. Owner decision still needed if the capability catalog does not define this key. Fallback if owner refuses a new key: allow only the three system role names and return capabilities for later action-specific gates, but mark this as weaker.

## n8n Manual Contract (not implemented here)

| Faena360 result | n8n must do | n8n must block/reject |
|---|---|---|
| Success | Store returned context in n8n memory for the current conversation; offer only operations supported by capabilities. | Do not trust tenant/user from provider or user text. |
| `USUARIO_NO_REGISTRADO` / `USUARIO_INACTIVO` | Send generic “number not registered/contact admin”. | Do not reveal whether user exists/inactive. |
| `TENANT_INVALIDO` | Stop flow and escalate/admin contact. | Do not continue with guessed tenant. |
| `ROL_NO_WHATSAPP` / `PERMISO_DENEGADO` | Stop flow with permission message. | Do not offer actions or call business endpoints. |
| `PAYLOAD_INVALIDO` | Fix normalization or ask for supported text message. | Do not retry same invalid payload blindly. |
| `WEBHOOK_NO_AUTORIZADO` | Treat as configuration/security failure. | Do not send user-facing operational success. |

Manual checklist: valid signed success; unknown phone; inactive user; inactive tenant; admin/supervisor phone; operational role missing capability; non-text type; bad signature; stale timestamp; DB unchanged for WhatsApp/session/operational records.

## Testing Strategy

| Layer | Must verify |
|---|---|
| Unit | HMAC hex format, timestamp freshness, payload shape, use-case outcomes for all controlled errors. |
| Integration | Route maps use-case results to exact HTTP/body; repository resolves phone with normalized digit logic and tenant-safe role/capability reads. |
| Manual | Signed requests from Postman/n8n simulator; every rejection above blocks downstream business calls. |

The issue is not done until bad signature, stale timestamp, admin/supervisor role, inactive tenant/user, unknown phone, missing capability, and non-text payload all fail/block.

## Implementation Handoff

| Slice | Goal | Files | Verification |
|---|---|---|---|
| 1 | Security + route skeleton | `apps/web/lib/webhooks/hmac.ts`, route/handler tests | HMAC/stale/malformed tests pass. |
| 2 | Application use case | `packages/application/src/whatsapp/*` | Outcome tests cover success + five business denials. |
| 3 | Supabase adapter | `packages/infrastructure/src/whatsapp/*` | Repository tests cover normalized phone and tenant/role filtering. |
| 4 | Wire endpoint | Route handler + exports | Route tests and manual signed curl pass. |

Size guard: if slice 1+2 exceed ~250 changed lines or total forecast exceeds 400, split into chained PRs before adding adapter tests.

## Risks / Open Questions

- Owner must confirm exact channel capability key (`whatsapp.channel.access` recommended).
- Replay protection is freshness-only; acceptable because identify is read-only.
- Operational default roles currently have no capability grants, so seeded test data may need explicit grants before success can pass.
