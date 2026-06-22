import type { AuditSource } from "../auth/audit";

export type ProjectEstado = "activo" | "pausado" | "finalizado" | "oculto";

export type ProjectFormaCobro = "monto_fijo" | "por_horas" | "por_dia";

export interface ProjectAuditContext {
  readonly actorId: string;
  readonly auditSource: AuditSource;
}

export interface ProjectCatalogSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly nombre: string;
  readonly cliente_id: string;
  readonly ubicacion: string;
  readonly fecha_inicio: string;
  readonly fecha_finalizacion: string | null;
  readonly forma_cobro: ProjectFormaCobro;
  readonly monto_fijo: number | null;
  readonly estado: ProjectEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateProjectInput {
  readonly nombre: string;
  readonly cliente_id: string;
  readonly ubicacion: string;
  readonly fecha_inicio: string;
  readonly forma_cobro: string;
  readonly monto_fijo?: number;
}

export interface UpdateProjectInput extends Omit<CreateProjectInput, "cliente_id"> {
  readonly projectId: string;
  readonly cliente_id: string;
  readonly fecha_finalizacion?: string | null;
}

export interface PauseProjectInput {
  readonly projectId: string;
  readonly force?: boolean;
  readonly reason?: string;
}

export interface FinishProjectInput {
  readonly projectId: string;
  readonly force?: boolean;
  readonly reason?: string;
}

export interface ReopenProjectInput {
  readonly projectId: string;
  readonly target_estado?: ProjectEstado;
}

export interface HideProjectInput {
  readonly projectId: string;
}

export type ProjectCatalogErrorCode =
  | "missing_tenant"
  | "missing_project"
  | "missing_nombre"
  | "missing_cliente"
  | "inactive_cliente"
  | "missing_ubicacion"
  | "missing_fecha_inicio"
  | "invalid_forma_cobro"
  | "missing_monto_fijo"
  | "duplicate_nombre"
  | "capability_denied"
  | "invalid_transition"
  | "open_jornadas_blocking"
  | "missing_forced_reason"
  | "project_create_failed"
  | "project_update_failed"
  | "project_pause_failed"
  | "project_finish_failed"
  | "project_reopen_failed"
  | "project_hide_failed"
  | "unknown_error";

export interface CreateProjectOutcome {
  readonly ok: boolean;
  readonly projectId?: string;
  readonly code?: ProjectCatalogErrorCode;
}

export interface MutateProjectOutcome {
  readonly ok: boolean;
  readonly code?: ProjectCatalogErrorCode;
}

export interface ProjectCatalogRepository {
  listVisible(input: { readonly tenantId: string }): Promise<readonly ProjectCatalogSummary[]>;

  create(
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly auditSource: AuditSource;
      readonly nombre: string;
      readonly cliente_id: string;
      readonly ubicacion: string;
      readonly fecha_inicio: string;
      readonly forma_cobro: ProjectFormaCobro;
      readonly monto_fijo?: number;
    }
  ): Promise<{ readonly id: string }>;

  update(
    input: {
      readonly tenantId: string;
      readonly projectId: string;
      readonly actorId: string;
      readonly auditSource: AuditSource;
      readonly nombre: string;
      readonly cliente_id: string;
      readonly ubicacion: string;
      readonly fecha_inicio: string;
      readonly forma_cobro: ProjectFormaCobro;
      readonly monto_fijo?: number;
      readonly fecha_finalizacion?: string | null;
    }
  ): Promise<boolean>;

  pause(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly force: boolean;
    readonly reason?: string;
  }): Promise<boolean>;

  finish(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly force: boolean;
    readonly reason?: string;
  }): Promise<boolean>;

  reopen(
    input: {
      readonly tenantId: string;
      readonly projectId: string;
      readonly actorId: string;
      readonly auditSource: AuditSource;
      readonly target_estado: ProjectEstado;
    }
  ): Promise<boolean>;

  hide(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
  }): Promise<boolean>;
}
