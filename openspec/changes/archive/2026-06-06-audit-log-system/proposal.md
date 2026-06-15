# Proposal: Audit Log System

## Intent

Implement reusable application-layer audit infrastructure for all sensitive mutations. Enunciado requires WHO acted, FROM WHERE (web/whatsapp/script/system), what CHANGED (before/after diff), and WHEN. Currently only a bare `audit_log` table exists — no application code consumes it.

## Scope

### In Scope
- Domain types: `AuditEntry`, `AuditAction`, `AuditSource`
- Application port: `AuditPort` with `write(entry)` and `read(filter)`
- Supabase adapter: `SupabaseAuditRepository` implementing the port
- Extend `audit_log`: add `source TEXT`, `old_value`/`new_value` JSONB columns
- Diff helper: `computeDiff(before, after) → {old, new}`
- Integration in: tenant creation, user CRUD, role changes, capability overrides, tenant config
- Sanitize sensitive fields; audit only after successful business operations

### Out of Scope
- UI/dashboard, operational modules, log export, cryptographic signatures

## Capabilities

### New Capabilities
- `audit-log-system`: Full application-layer audit — domain types, port, repository adapter, diff helper, wiring into all sensitive mutations. Covers source tracing, before/after JSONB diffs, field sanitization.

### Modified Capabilities
- `authorization-base`: Relax "Minimal authorization audit history" requirement. Remove "MUST NOT require richer audit detail fields." Authorization audit delegates to `audit-log-system`.

## Approach

Hexagonal layers: domain in `packages/shared/`, port in `packages/application/`, adapter in `packages/infrastructure/`. Constructor DI — services receive `AuditPort` via constructor. `actorUserId` passed explicitly (no middleware). Migration adds columns with `DEFAULT 'web'`. Tenant creation script writes audit directly (service role).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | Modified | New migration: extend `audit_log` |
| `packages/shared/` | New | Domain types |
| `packages/application/` | New | `AuditPort` |
| `packages/infrastructure/` | New | Adapter + tests |
| `apps/web/scripts/` | Modified | Wire audit into tenant creation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Service role scripts lack RLS context | Med | Write audit directly; integration-test |
| No middleware → explicit actor | Low | Document pattern |
| Spec conflict: minimal vs rich audit | Low | Modify `authorization-base` spec |

## Rollback Plan

Drop migration columns; revert DI wiring (services handle missing `AuditPort` gracefully); revert spec changes.

## Dependencies

- Issues 1, 4, 7, 9, 10 (tenant infra, user profiles, roles, capabilities, config)

## Success Criteria

- [ ] Audit entries written for all 6 sensitive mutation categories
- [ ] `source` field correct per enunciado
- [ ] `old_value`/`new_value` JSONB diffs present
- [ ] Sensitive fields sanitized before storage
- [ ] No audit writes on failed operations
- [ ] `pnpm test` passes
