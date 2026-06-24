# Design: Tenant Client Catalog

## Technical Approach

Add `clientes` as a tenant-scoped catalog using the existing hexagonal split: domain contracts, application service/use cases, Supabase infrastructure repository, and a Next.js App Router page with Server Actions. The web page must reuse the current dashboard/session pattern: refreshed `AppSession`, `web.portal.access`, effective capability checks, and repeated action gates server-side.

The route for this change is `/dashboard/clientes`. Apply should replace the earlier issue #44 placeholder link `/dashboard/clients` with `/dashboard/clientes` for the clients module.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
| --- | --- | --- | --- |
| Route | Use `/dashboard/clientes`. | Keep `/dashboard/clients` from issue #44 placeholder. | The active proposal and user-facing module are Spanish; issue #44 was only a shared placeholder pattern. |
| Authorization | Check `clients:read/create/update` from `AppSession.effective_capabilities` in UI/actions and `requireCapability` in application service. | UI-only gates or role checks. | Existing app denies by effective capabilities, not roles; direct POST must not bypass UI. |
| Repository scope | Every repository method receives `tenantId` and filters `.eq("tenant_id", tenantId)`. | Trust RLS only. | Web uses service-role clients that bypass RLS, so app filters are mandatory defense-in-depth. |
| Delete model | No app delete method; `hideClient` updates `estado` to `oculto`. | Physical delete or generic update state endpoint. | Proposal requires retained records and no DELETE flow. |

## Data Flow

```text
cookies -> requireWebAccess -> AppSession
  -> /dashboard/clientes page gate: clients:read
  -> client service.listActiveClients(session)
  -> SupabaseClientCatalogRepository.listActive({ tenantId })
  -> clientes where tenant_id=session.tenant_id and estado='activo'

Server Action -> refreshed session -> action capability gate
  -> application service normalizes/validates
  -> repository insert/update/hide scoped by tenantId
  -> revalidatePath('/dashboard/clientes')
```

## File Changes

| File | Action | Description |
| --- | --- | --- |
| `supabase/migrations/<timestamp>_create_clientes.sql` | Create | Add `clientes` table, `estado` check (`activo`, `oculto`), tenant FK, timestamps, `updated_at` trigger, RLS SELECT/INSERT/UPDATE policies, explicit DELETE deny. Attach audit trigger if current trigger list does not auto-cover new tables. |
| `supabase/tests/clientes_catalog.sql` | Create | SQL tests for tenant isolation, active-only list, create/update/hide, missing name, and DELETE denial. |
| `packages/domain/src/clients/client-catalog.ts` | Create | DTOs, summaries, repository port, outcome/error codes. |
| `packages/domain/src/clients/index.ts`, `packages/domain/src/index.ts` | Modify | Export client catalog contracts. |
| `packages/application/src/clients/client-catalog.ts` | Create | Service with list/create/update/hide, normalization, capability checks, tenant override rejection. |
| `packages/application/src/index.ts` | Modify | Export clients service. |
| `packages/infrastructure/src/clients/SupabaseClientCatalogRepository.ts` | Create | Supabase implementation with tenant filters and active-only list. |
| `packages/infrastructure/src/index.ts` | Modify | Export clients repository. |
| `apps/web/app/dashboard/clientes/page.tsx` | Create | Server-rendered catalog page, read-only rendering, create/update/hide forms gated by capabilities, Server Actions. |
| `apps/web/app/dashboard/page.tsx` | Modify | Change clients module href to `/dashboard/clientes`. |
| `*.test.ts`, `*.runtime.test.tsx` | Create/modify | Unit/runtime coverage matching existing Vitest patterns. |

## Interfaces / Contracts

```ts
type ClienteEstado = "activo" | "oculto";
type ClienteSummary = {
  id: string; tenant_id: string; nombre: string;
  telefono: string | null; correo: string | null;
  identificacion: string | null; direccion: string | null;
  estado: ClienteEstado; created_at: string; updated_at: string;
};
```

Service outcomes should follow current user-management style: `{ ok: true }` or `{ ok: false, code: "missing_tenant" | "missing_client" | "missing_nombre" | "capability_denied" | "client_create_failed" | "client_update_failed" }`.

## Testing Strategy

| Layer | What to Test | Approach |
| --- | --- | --- |
| Application | capability denial, tenant override rejection, required `nombre`, create/update/hide delegation. | Vitest with fake repository/capability checker. |
| Infrastructure | repository applies tenant filters and active-only list mapping. | Vitest mock Supabase query chain, like existing infra tests. |
| Runtime UI | page/action gates, read-only UI, hidden mutation controls. | `renderToStaticMarkup` tests near `page.tsx`. |
| SQL | RLS tenant isolation, DELETE deny, constraints, hide behavior. | Add SQL file; run only with explicit approval. |

## Migration / Rollout

Roll out DB first, then packages, then web route/navigation. No backfill is needed for a new table. Supabase verification later requires approval for: `supabase db reset`, then `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/clientes_catalog.sql`.

## Open Questions

- [ ] Should `correo` be globally/tenant-unique for clients? The proposal only requires optional storage, so design does not add uniqueness.
