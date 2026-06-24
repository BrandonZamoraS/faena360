# Design: Audit Log System (Trigger-Based)

## Technical Approach

Replace application-level audit writes with PostgreSQL AFTER triggers. When a sensitive mutation succeeds, the trigger fires atomically in the same transaction, guaranteeing 100% audit coverage. The application only sets session context variables (`app.current_actor_id`, `app.audit_source`, `app.audit_target_id`) before mutating. Diff computation, sanitization, and insertion all happen inside the database.

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|----------|---------|-----------|--------|
| **Audit write mechanism** | Application-level `AuditPort.write()` vs PostgreSQL triggers | App writes can be skipped on exceptions or bugs; triggers are atomic with the mutation | PostgreSQL triggers — guarantees 100% registration |
| **Trigger granularity** | One generic function vs per-table functions | Generic is less code; per-table allows table-specific logic (e.g., `user_profiles` has different actions than `roles`) | Single generic `audit_trigger()` using `TG_TABLE_NAME` and `TG_OP` — sufficient for current tables |
| **Context passing** | Session variables (`SET LOCAL`) vs explicit parameters in every mutation call | Session variables are set once per operation; explicit params clutter every service method | Session variables via `set_audit_context()` RPC — cleaner services |
| **Diff computation** | TypeScript `computeDiff` vs PostgreSQL JSONB functions | TypeScript requires fetching old row first (extra query); PostgreSQL has `OLD`/`NEW` natively | PostgreSQL `jsonb_diff(OLD, NEW)` — zero extra queries, always accurate |
| **Sanitization** | TypeScript `sanitize` vs PostgreSQL function | Same as diff — PostgreSQL sees the row data first | PostgreSQL `sanitize_jsonb()` — redacts keys matching `*password*`, `*token*`, `*secret*`, `*api_key*` |
| **AuditPort shape** | Read-write vs read-only | Removing `write()` means no DI of audit dependencies into services | Read-only `AuditPort` with single `read(filter)` method |

## Data Flow

```
Service ──► SET context ──► Mutate DB ──► TRIGGER ──► audit_log
              │                               │
              │         (same transaction)    │
              │                               ▼
              │              ┌────────────────┴──────────────┐
              │              │ audit_trigger()               │
              │              │ - reads session vars          │
              │              │ - reads current_app_tenant_id │
              │              │ - computes diff (OLD vs NEW)  │
              │              │ - sanitizes sensitive keys    │
              │              │ - inserts audit_log           │
              │              └───────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/domain/src/auth/audit.ts` | Create | Read-only types: `AuditEntry`, `AuditAction`, `AuditSource` |
| `packages/domain/src/auth/index.ts` | Modify | Export audit types |
| `packages/application/src/auth/audit.ts` | Create | `AuditPort` interface (read-only): `read(filter)` only |
| `packages/application/src/auth/index.ts` | Modify | Export `AuditPort` |
| `packages/infrastructure/src/auth/SupabaseAuditRepository.ts` | Create | Adapter: `read()` with snake_case mapping and filtering |
| `packages/infrastructure/src/auth/SupabaseAuditRepository.test.ts` | Create | Mock Supabase client tests for `read()` |
| `packages/infrastructure/src/auth/index.ts` | Modify | Export `SupabaseAuditRepository` |
| `packages/shared/src/audit/diff.ts` | Delete | Logic moved to PostgreSQL |
| `packages/shared/src/audit/diff.test.ts` | Delete | Tests moved to SQL |
| `packages/shared/src/audit/` | Remove | Directory no longer needed |
| `supabase/migrations/20250610000000_extend_audit_log.sql` | Create | Add `source`, `old_value`, `new_value` columns |
| `supabase/migrations/20250611000000_audit_triggers.sql` | Create | `audit_trigger()` function + triggers on 6 tables |
| `supabase/scripts/create-tenant-with-admin.ts` | Modify | Call `set_audit_context()` before each sensitive mutation |

## Interfaces / Contracts

```typescript
// packages/domain/src/auth/audit.ts
export type AuditSource = "web" | "whatsapp" | "script" | "system";

export type AuditAction =
  | "tenant.create"
  | "user.create"
  | "user.update"
  | "user.deactivate"
  | "user.reactivate"
  | "role.create"
  | "role.update"
  | "role.assign"
  | "capability.override"
  | "tenant.config.update";

export interface AuditEntry {
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly targetUserId: string | null;
  readonly action: AuditAction;
  readonly source: AuditSource;
  readonly oldValue: Record<string, unknown> | null;
  readonly newValue: Record<string, unknown> | null;
  readonly occurredAt: Date;
}

// packages/application/src/auth/audit.ts
export interface AuditPort {
  read(filter: {
    tenantId: string;
    action?: AuditAction;
    limit?: number;
  }): Promise<readonly AuditEntry[]>;
}

// Application integration pattern
await supabase.rpc("set_audit_context", {
  actor_id: currentUserId,
  source: "web",
  target_id: targetUserId, // optional
});
await supabase.from("user_profiles").update({ ... }).eq("id", targetUserId);
// Trigger fires automatically
```

```sql
-- supabase/migrations/20250611000000_audit_triggers.sql
CREATE OR REPLACE FUNCTION set_audit_context(
  actor_id UUID,
  source TEXT,
  target_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_actor_id', actor_id::text, true);
  PERFORM set_config('app.audit_source', source, true);
  IF target_id IS NOT NULL THEN
    PERFORM set_config('app.audit_target_id', target_id::text, true);
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID := NULLIF(current_setting('app.current_actor_id', true), '')::UUID;
  source TEXT := COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'system');
  target_id UUID := NULLIF(current_setting('app.audit_target_id', true), '')::UUID;
  old_val JSONB := NULL;
  new_val JSONB := NULL;
  action_name TEXT;
BEGIN
  action_name := TG_TABLE_NAME || '.' ||
    CASE TG_OP
      WHEN 'INSERT' THEN 'create'
      WHEN 'UPDATE' THEN 'update'
      WHEN 'DELETE' THEN 'delete'
    END;

  IF TG_OP = 'UPDATE' THEN
    old_val := jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(OLD))
      WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key;
    new_val := jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key;
  ELSIF TG_OP = 'INSERT' THEN
    new_val := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    old_val := to_jsonb(OLD);
  END IF;

  -- Sanitize
  IF old_val IS NOT NULL THEN
    SELECT jsonb_object_agg(
      key,
      CASE WHEN key ~* 'password|token|secret|api_key' THEN '"[REDACTED]"'::JSONB ELSE value END
    ) INTO old_val FROM jsonb_each(old_val);
  END IF;
  IF new_val IS NOT NULL THEN
    SELECT jsonb_object_agg(
      key,
      CASE WHEN key ~* 'password|token|secret|api_key' THEN '"[REDACTED]"'::JSONB ELSE value END
    ) INTO new_val FROM jsonb_each(new_val);
  END IF;

  INSERT INTO audit_log (
    tenant_id, actor_user_id, target_user_id,
    action, source, old_value, new_value, occurred_at
  ) VALUES (
    current_app_tenant_id(), actor_id, target_id,
    action_name, source, old_val, new_val, now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `audit_trigger()` diff logic: INSERT (new only), UPDATE (changed fields only), DELETE (old only) | PL/pgSQL tests in `supabase/tests/audit_trigger.test.sql` using `pgtap` |
| Unit | `audit_trigger()` sanitization: redacts `password`, `token`, `secret`, `api_key` | Same SQL test file |
| Integration | Trigger fires on actual INSERT/UPDATE/DELETE and produces correct `audit_log` row | Supabase seed + SQL assertions |
| Integration | `set_audit_context()` correctly sets session variables readable by trigger | SQL test: call function, assert `current_setting()` values |
| Integration | `AuditPort.read()` filters by tenant, action, limit | Vitest with mocked Supabase client |
| RLS | `audit_log` tenant isolation cross-tenant reads blocked | Existing migration test pattern for `current_app_tenant_id()` |

## Migration / Rollout

1. `supabase/migrations/20250610000000_extend_audit_log.sql` — add `source`, `old_value`, `new_value` columns (same as before, backfill-compatible).
2. `supabase/migrations/20250611000000_audit_triggers.sql` — create `set_audit_context()` and `audit_trigger()`, attach AFTER triggers to:
   - `tenants`
   - `user_profiles`
   - `roles`
   - `role_capabilities`
   - `user_capability_overrides`
   - `tenant_configurations`

**Order matters**: column migration must run before trigger migration.
**No breaking changes**: triggers only add rows; no existing application code reads `audit_log` yet.
**Rollback**: drop triggers first, then drop function.

## Open Questions

- Should `user_roles` also have a trigger for role assignment tracking, or is `role.assign` covered by `role_capabilities` changes?
- For batch updates (e.g., bulk role grant), should we optimize with a single `audit_log` row or one per affected row? (Current trigger produces one per row.)
- Should `audit_log` rows for `DELETE` hard-delete or soft-delete semantics be reflected in the action name?

## Next Step

Ready for `sdd-tasks`.
