import type { AuditAction, AuditEntry } from "@faena360/domain";

/**
 * Read-only audit port for querying audit log entries.
 *
 * The port exposes a single `read()` method for retrieving audit records.
 * Audit writes are handled exclusively by PostgreSQL AFTER triggers;
 * no application-level `write()` method exists on this port.
 *
 * Implementations (e.g., {@link SupabaseAuditRepository}) are responsible
 * for mapping database rows to {@link AuditEntry} domain objects.
 */
export interface AuditPort {
  /**
   * Read audit entries for a given tenant, optionally filtered by action.
   *
   * @param filter.tenantId - Required tenant scope.
   * @param filter.action   - Optional action type filter.
   * @param filter.limit    - Maximum number of entries to return (default: implementation-defined).
   * @returns Immutable array of audit entries matching the filter.
   */
  read(filter: {
    tenantId: string;
    action?: AuditAction;
    limit?: number;
  }): Promise<readonly AuditEntry[]>;
}
