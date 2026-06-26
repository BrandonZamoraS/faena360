# Design: Issue #69 Tenant-aware validation config for n8n

## Technical Approach

Expose a read-only internal Next.js Route Handler: `GET /api/config/validacion?tipo={tipo}`. n8n calls it after issue #68 identity lookup, signs the request with existing Faena HMAC headers, and passes the resolved `tenantId`/`userId`. The service validates `tipo`, tenant/user/capability, loads the tenant override, merges it over system defaults, validates the effective shape, and returns validation metadata only. It never creates operational, WhatsApp conversation, or session rows.

## Architecture Decisions

| Decision | Choice | Tradeoff / rationale |
|---|---|---|
| Route/method | `GET /api/config/validacion?tipo=...` | Keeps read-only semantics and matches docs; empty-body HMAC follows current webhook verifier behavior. |
| Auth boundary | HMAC + `X-Faena-Tenant-Id` + `X-Faena-User-Id` from issue #68 | Fits n8n better than browser cookies; backend still revalidates tenant/user/capability and never trusts headers alone. |
| Capability gate | MVP reuses `whatsapp.channel.access` unless owner asks for `whatsapp.validation_config.read` | Avoids extra authorization churn; less granular. |
| Persistence | Create `tenant_validation_configs` keyed by `(tenant_id, tipo)` with `config jsonb` override | Backend-only static config is insufficient. Table makes tenant customization explicit while preserving system defaults in application code. |
| Merge model | `effective = systemDefault[tipo] + tenantOverride.config` | Deterministic fallback; tenants can personalize labels/requiredness/field metadata without losing default fields. |

## Data Flow

```text
n8n signed GET + identity headers
  -> route verifies HMAC/query/header shape
  -> service validates tipo + tenant/user/capability
  -> repository loads tenant_validation_configs where tenant_id + tipo
  -> service deep-merges default + override, validates shape
  -> response { tipo, tenantId, source, campos }
```

## Persistence Shape

Recommended migration:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | generated |
| `tenant_id` | uuid not null fk `tenants(id)` cascade | direct tenant isolation |
| `tipo` | text not null | check supported six tipos |
| `config` | jsonb not null default `{}` | tenant override only, not full copied default |
| `created_at`, `updated_at` | timestamptz | follow existing migration style |

Constraints/indexes: `unique (tenant_id, tipo)`, index on `tenant_id`, RLS policies matching direct `tenant_id = current_app_tenant_id()`. Because service-role access bypasses RLS, repository queries must still include `.eq("tenant_id", tenantId).eq("tipo", tipo)`. Attach audit trigger or include table in audit infrastructure follow-up; `audit_trigger()` already recognizes `tenant_configurations`, so either reuse that table name only if semantically acceptable or add the new table to audit trigger setup.

## Merge / Shape Rules

System defaults live in `packages/application/src/validation-config/defaults.ts`. Tenant `config` may override known fields and metadata only. Stored/effective shape must validate before use:

- top-level object with optional `campos` object;
- field keys are non-empty strings and must either exist in defaults or be explicitly allowed by schema;
- each field supports `obligatorio: boolean`, `tipo: string enum`, optional `label`, `ayuda`, `opciones`;
- invalid JSON shape returns controlled internal failure, not partial unsafe config.

Merge is field-level deep merge: default field remains unless overridden; missing tenant rows return default-only response with `source: "system_default"`; merged rows return `source: "tenant_override"`.

## API Contract

Success `200`:
```json
{ "tipo": "inicio_jornada", "tenantId": "uuid", "source": "tenant_override", "campos": { "field_key": { "obligatorio": true, "tipo": "string" } } }
```

Controlled errors:

| Code | HTTP | Meaning |
|---|---:|---|
| `TIPO_INVALIDO` | 400 | Missing, malformed, or unsupported `tipo`. |
| `TENANT_INVALIDO` | 403 | Missing/inactive tenant or user not in tenant. |
| `PERMISO_DENEGADO` | 401/403 | Bad HMAC/internal context or missing effective capability. |
| `CONFIG_INVALIDA` | 500 | Stored tenant override violates schema; log server-side. |

Error body: `{ "ok": false, "errorCode": "...", "message": "Controlled validation-config rejection." }`.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_create_tenant_validation_configs.sql` | Create | Table, constraints, RLS, optional audit trigger registration, optional seed examples. |
| `apps/web/app/api/config/validacion/route.ts` | Create | GET wrapper. |
| `apps/web/app/api/config/validacion/handler.ts` | Create | HMAC, query/header parsing, HTTP mapping. |
| `packages/application/src/validation-config/*` | Create | Types, defaults, merge/shape validator, service, ports, outcomes. |
| `packages/infrastructure/src/validation-config/*` | Create | Supabase tenant/user/capability checks and tenant override loading. |
| `packages/*/src/index.ts` | Modify | Export module. |

## Testing / Verification Strategy

Add Vitest coverage for default-only, tenant override merge, invalid stored config, all controlled errors, and route HMAC/header mapping. Add Supabase SQL test for tenant RLS/isolation if migration is included. Verify with `pnpm --filter @faena360/web typecheck`, `pnpm lint`, targeted `pnpm test -- validation-config`, and local SQL tests when available.

## Implementation Handoff

| Slice | Goal | Files | Acceptance | Verification |
|---|---|---|---|---|
| 1 | Schema | `supabase/migrations/*tenant_validation_configs.sql`, `supabase/tests/*` | Per-tenant override rows are isolated and unique by tipo. | Supabase SQL test/local reset |
| 2 | Contract + merge | `packages/application/src/validation-config/*` | Effective config equals default plus tenant override; invalid shape rejected. | `pnpm test -- validation-config` |
| 3 | Adapter + route | `packages/infrastructure/src/validation-config/*`, `apps/web/app/api/config/validacion/*` | Signed request returns tenant-effective config only. | route tests + signed manual GET |

## Review Workload Forecast

- Estimated changed lines: 500-700 with table, RLS, service, route, and tests.
- 400-line budget risk: High. This is no longer a static-config-only change.
- Chained PR recommendation: likely split PR 1 schema/application merge contract, PR 2 route/infrastructure wiring/tests.
- Decision before apply: confirm capability granularity only; persistence direction is tenant override table with system default fallback.

## Non-goals / Open Questions

- No n8n workflow implementation, operational record creation, WhatsApp session persistence, or generic form engine.
- [ ] Should MVP keep `whatsapp.channel.access` or introduce `whatsapp.validation_config.read`?
