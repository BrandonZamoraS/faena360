/**
 * Audit domain types for the trigger-based audit-log-system.
 *
 * These types define the read-only shape of audit entries consumed
 * by the application layer. Audit writes are handled entirely by
 * PostgreSQL AFTER triggers; the application only sets session
 * context via `set_audit_context()` before mutating data.
 */

/** Origin of the audited action. */
export type AuditSource = "web" | "whatsapp" | "script" | "system";

/** Action categories tracked by the audit log. */
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

/** Read-only representation of a single audit log entry. */
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
