import type { AuditSource } from "../auth/audit";

export type AssignmentEstado =
  | "activa"
  | "retirada_del_proyecto"
  | "cerrada_por_finalizacion"
  | "bloqueada_por_conflicto";

export interface MachineAssignment {
  readonly id: string;
  readonly tenant_id: string;
  readonly maquina_id: string;
  readonly proyecto_id: string;
  readonly subproyecto_id: string | null;
  readonly operador_id: string;
  readonly tarifa_aplicada: number;
  readonly estado: AssignmentEstado;
  readonly fecha_inicio: string;
  readonly fecha_fin: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateAssignmentInput {
  readonly maquina_id: string;
  readonly proyecto_id: string;
  readonly subproyecto_id?: string | null;
  readonly operador_id: string;
  readonly tarifa_aplicada: number;
}

export type AssignmentErrorCode =
  | "missing_tenant"
  | "missing_assignment"
  | "missing_maquina"
  | "missing_proyecto"
  | "missing_operador"
  | "missing_tarifa"
  | "machine_not_por_tiempo"
  | "machine_not_active"
  | "machine_already_assigned"
  | "project_not_active"
  | "user_not_operador"
  | "capability_denied"
  | "assignment_create_failed"
  | "assignment_update_failed"
  | "unknown_error";

export interface AssignmentOutcome {
  readonly ok: boolean;
  readonly assignmentId?: string;
  readonly code?: AssignmentErrorCode;
}

/**
 * Represents a single audit log entry for an assignment change.
 * Returned by list_asignacion_historial RPC.
 */
export interface AssignmentHistoryEntry {
  readonly occurred_at: string;
  readonly action: string;
  readonly actor_user_id: string | null;
  readonly old_value: Record<string, unknown> | null;
  readonly new_value: Record<string, unknown> | null;
  readonly source: string;
}

/**
 * Filters for listing active assignments.
 * All fields are optional — defaults to no filter.
 */
export interface MachineAssignmentHistoryFilters {
  readonly proyectoId?: string | null;
  readonly maquinaId?: string | null;
}

export interface MachineAssignmentRepository {
  listActive(input: {
    readonly tenantId: string;
    readonly proyectoId?: string | null;
    readonly maquinaId?: string | null;
  }): Promise<readonly MachineAssignment[]>;

  listHistory(input: {
    readonly tenantId: string;
    readonly assignmentId: string;
  }): Promise<readonly AssignmentHistoryEntry[]>;

  create(
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly auditSource: AuditSource;
    } & CreateAssignmentInput
  ): Promise<{ readonly id: string }>;

  updateStatus(input: {
    readonly tenantId: string;
    readonly assignmentId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly estado: AssignmentEstado;
  }): Promise<boolean>;
}
