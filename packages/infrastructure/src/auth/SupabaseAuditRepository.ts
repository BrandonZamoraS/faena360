import type { AuditEntry, AuditAction } from "@faena360/domain";
import type { AuditPort } from "@faena360/application";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Raw shape of an audit_log row returned by Supabase.
 * All columns use snake_case as stored in the database.
 */
interface AuditLogRow {
  tenant_id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: string;
  source: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  occurred_at: string;
}

/**
 * Supabase-backed read-only audit repository.
 *
 * Implements {@link AuditPort} by querying the `audit_log` table.
 * Maps snake_case database rows to camelCase {@link AuditEntry} domain objects.
 *
 * @example
 * ```ts
 * const repo = new SupabaseAuditRepository(supabaseClient);
 * const entries = await repo.read({ tenantId: "t1", action: "user.update", limit: 50 });
 * ```
 */
export class SupabaseAuditRepository implements AuditPort {
  constructor(private readonly client: SupabaseClient) {}

  /** @inheritdoc */
  async read(filter: {
    tenantId: string;
    action?: AuditAction;
    limit?: number;
  }): Promise<readonly AuditEntry[]> {
    const maxLimit = filter.limit ?? 100;

    let query = this.client
      .from("audit_log")
      .select("*")
      .eq("tenant_id", filter.tenantId)
      .order("occurred_at", { ascending: false })
      .limit(maxLimit);

    if (filter.action) {
      query = query.eq("action", filter.action);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Failed to read audit entries: ${error.message} (${error.code})`
      );
    }

    const rows = (data ?? []) as AuditLogRow[];

    return rows.map(mapRowToEntry);
  }
}

/**
 * Maps a snake_case database row to a camelCase {@link AuditEntry}.
 */
function mapRowToEntry(row: AuditLogRow): AuditEntry {
  return {
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    targetUserId: row.target_user_id,
    action: row.action as AuditAction,
    source: row.source as AuditEntry["source"],
    oldValue: row.old_value,
    newValue: row.new_value,
    occurredAt: new Date(row.occurred_at),
  };
}
