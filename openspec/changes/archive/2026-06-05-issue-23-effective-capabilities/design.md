# Design: Effective Capabilities Resolver

## Technical Approach

Add ABAC domain types under `packages/domain/src/auth` and an application resolver under `packages/application/src/auth`. Infrastructure remains behind repository/cache ports because the DB/session contracts are prerequisites.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Resolver location | `packages/application` | Authorization behavior belongs in application services, not UI or vendor SDKs. |
| Domain contracts | `packages/domain/src/auth` | Capability identifiers and overrides are domain vocabulary. |
| Data access | Repository port | Keeps implementation compatible with future Supabase adapter without inventing schema details. |
| Cache | In-memory TTL cache implementing a port | Satisfies short cache requirement; distributed cache is out of scope. |
| Override order | Apply allow, then deny | Deny must win when both role/allow and deny exist. |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/domain/src/auth/*` | Create | Capability domain types and barrel export |
| `packages/application/src/auth/*` | Create | Resolver, cache, guard, tests, barrel export |
| `packages/domain/index.ts`, `packages/domain/src/index.ts` | Modify | Export auth types |
| `packages/application/index.ts` | Modify | Export resolver API |
| `packages/application/package.json` | Modify | Depend on `@faena360/domain` |

## Testing Strategy

Vitest tests cover the issue acceptance criteria at unit level. Integration tests for DB/session adapters are deferred until those adapters exist.

## Migration / Rollout

No migration required.

## Open Questions

- [ ] Which issue #20 session adapter will call `requireCapability`?
- [ ] Which migration owns the concrete auth/role/capability tables?
