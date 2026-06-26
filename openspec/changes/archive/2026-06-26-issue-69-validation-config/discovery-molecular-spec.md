# Molecular Spec: issue-69-validation-config

## Molecular Spec: issue-69-validation-config

### Source Inputs
- Issue/request: present — expose tenant-aware validation config by operational record type so n8n can ask only the required questions without hardcoding rules.
- Primary docs: `obsidian-vault/01-producto/enunciado-sistema/01-enunciado-parte-1.md`, `obsidian-vault/01-producto/enunciado-sistema/09-enunciado-parte-9.md`, `obsidian-vault/01-producto/enunciado-sistema/10-enunciado-parte-10.md`, `obsidian-vault/01-producto/enunciado-sistema/12-enunciado-parte-12.md`, `obsidian-vault/08-whatsapp-n8n/validaciones.md`, `obsidian-vault/08-whatsapp-n8n/payloads-api.md`, `obsidian-vault/04-specs/mvp/1.4-whatsapp-n8n-minimo.md`, `openspec/specs/authorization-base/spec.md`, `openspec/specs/effective-capabilities/spec.md`.
- Targeted code checked: `apps/web/app/api/webhooks/whatsapp/identify/handler.ts`, `apps/web/lib/auth/session.ts`, `apps/web/lib/supabase.ts`, `apps/web/lib/webhooks/hmac.ts`, `packages/application/src/auth/app-session.ts`, `packages/application/src/whatsapp/identify.ts`, `packages/infrastructure/src/auth/SupabaseAppSessionRepository.ts`, `packages/infrastructure/src/whatsapp/SupabaseWhatsappIdentityRepository.ts`, `supabase/migrations/20250606000000_rls_multitenant_isolation.sql`, `supabase/migrations/20250611000000_audit_triggers.sql`, `supabase/migrations/20260622170000_issue_68_whatsapp_identity_lookup.sql`, `supabase/migrations/20260622183000_seed_whatsapp_channel_access.sql`, `supabase/tests/whatsapp_channel_access.sql`.

### Intended Behavior
Faena360 SHALL expose an internal validation-config endpoint for n8n that returns the effective field contract for one supported operational `tipo` inside the caller's tenant context. The response SHALL indicate, per field, whether it is required or optional and the expected field type, for at least `inicio_jornada`, `cierre_jornada`, `gasto`, `compra_combustible`, `carga_combustible`, and `mantenimiento`. The endpoint SHALL reject unsupported `tipo`, missing/invalid tenant context, and permissionless callers with controlled errors (`TIPO_INVALIDO`, `TENANT_INVALIDO`, `PERMISO_DENEGADO`). The endpoint SHALL NOT create operational records, conversation rows, or WhatsApp session state.

### Capability / Domain
WhatsApp/n8n configuration lookup at the boundary between multitenant authorization, tenant-scoped operational configuration, and backend-owned validation rules.

### Acceptance Scenarios
- GIVEN an authenticated internal caller with valid tenant/user context AND `tipo=inicio_jornada` WHEN `/api/config/validacion` is requested THEN the API returns `tipo`, resolved `tenantId`, and a `campos` map that distinguishes required vs optional fields and expected field types.
- GIVEN a supported `tipo` for a different tenant's data WHEN the caller requests config THEN only the caller's tenant-effective configuration is returned and no cross-tenant data leaks.
- GIVEN `tipo` equal to one of `cierre_jornada`, `gasto`, `compra_combustible`, `carga_combustible`, or `mantenimiento` WHEN the endpoint responds THEN the contract reflects the backend validation source of truth for that tenant and type.
- GIVEN an unsupported or malformed `tipo` WHEN the endpoint is requested THEN the API rejects with controlled error `TIPO_INVALIDO` and does not fall back to guessed defaults.
- GIVEN missing tenant resolution, inactive/invalid tenant context, or a caller without the required effective permission WHEN the endpoint is requested THEN the API rejects with `TENANT_INVALIDO` or `PERMISO_DENEGADO`.
- GIVEN any request to this endpoint WHEN it completes THEN no operational rows, WhatsApp conversation rows, or session-persistence rows are created in Faena360.

### Minimal Affected Areas
- `apps/web/app/api/config/validacion/` — new internal Route Handler and HTTP contract.
- `apps/web/lib/auth/session.ts` or `apps/web/lib/webhooks/hmac.ts` — reuse/adapt the internal auth boundary depending on whether apply confirms authenticated user context, HMAC, or a composed pattern.
- `packages/application/src/` — new validation-config use case/service that resolves tenant-effective field requirements and maps controlled errors.
- `packages/infrastructure/src/` — repository/adapter that loads tenant-scoped validation config from the backend source of truth and filters it by supported `tipo`.
- `supabase/migrations/` and `supabase/tests/` — only if the planned validation-config persistence source is still missing and must be formalized to match the documented contract.
- `openspec/changes/issue-69-validation-config/` — this discovery artifact.

### Out of Scope
- Implementing n8n workflows, prompts, provider-specific WhatsApp logic, or conversation memory.
- Creating operational flows for jornada, gasto, mantenimiento, or combustible beyond exposing their validation metadata.
- Persisting WhatsApp sessions, incomplete conversations, or new session/conversation tables in Faena360.
- Creating operational records from this endpoint.
- Building a generic form engine outside the MVP validation-config contract.

### Risks
- The docs clearly require the endpoint, but the repo does not yet contain a concrete validation-config table/repository; `tenant_configurations` is referenced by audit infrastructure, yet no migration currently creates it. Apply may need a schema decision before code wiring.
- There is an auth-boundary ambiguity: the 1.4 technical spec says the validation endpoint uses HMAC like the webhook, while issue #69 asks for tenant resolution from authenticated user context. Design must reconcile this before implementation.
- The six supported `tipo` values span domains whose final backend validators are not all implemented in repo code yet, so the config contract must be anchored to documented rules without inventing fields that later drift from real validation.
- Service-role-backed server access bypasses RLS by design; apply must keep explicit tenant scoping in the repository/use case so multitenant isolation is not delegated only to infrastructure.

### Owner Questions
- Which trust boundary is authoritative for this endpoint: internal HMAC caller, authenticated user JWT/session, or HMAC plus an already-resolved operative user context from issue #68?
- What is the canonical persistence source for tenant validation config today: an existing but not-yet-implemented `tenant_configurations` table, another planned structure, or a temporary backend-owned mapping until operational modules land?

### Review Workload Forecast
- Estimated changed lines: 260-430.
- 400-line budget risk: Medium-High if the same PR includes route, application service, persistence adapter, migration, and tests.
- Chained PRs recommended: Ask during design/apply; probably yes if schema work is required, probably no if the source already exists and only route/service wiring is added.
- Decision needed before apply: Yes — the auth boundary and canonical config source must be fixed first.

### Ready for Design
Yes — but only after the owner/design step resolves the auth boundary and the canonical validation-config source of truth.
