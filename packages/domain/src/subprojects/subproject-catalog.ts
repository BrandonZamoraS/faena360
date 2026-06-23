import type { AuditSource } from "../auth/audit";

export type SubprojectEstado = "activo" | "pausado" | "finalizado" | "oculto";

export type SubprojectFormaCobro = "monto_fijo" | "por_horas" | "por_dia";

export interface SubprojectAuditContext {
  readonly actorId: string;
  readonly auditSource: AuditSource;
}

export interface SubprojectCatalogSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly proyecto_id: string;
  readonly nombre: string;
  readonly ubicacion: string | null;
  readonly forma_cobro: SubprojectFormaCobro | null;
  readonly monto_fijo: number | null;
  readonly estado: SubprojectEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateSubprojectInput {
  readonly proyecto_id: string;
  readonly nombre: string;
  readonly ubicacion?: string;
  readonly forma_cobro?: SubprojectFormaCobro;
  readonly monto_fijo?: number;
}

export interface UpdateSubprojectInput {
  readonly subprojectId: string;
  readonly proyecto_id: string;
  readonly nombre: string;
  readonly ubicacion?: string;
  readonly forma_cobro?: SubprojectFormaCobro;
  readonly monto_fijo?: number;
}

export interface FinishSubprojectInput {
  readonly subprojectId: string;
  readonly force?: boolean;
  readonly reason?: string;
}

export interface ReopenSubprojectInput {
  readonly subprojectId: string;
  readonly target_estado?: SubprojectEstado;
}

export interface HideSubprojectInput {
  readonly subprojectId: string;
}

export type SubprojectCatalogErrorCode =
  | "missing_tenant"
  | "missing_project"
  | "missing_nombre"
  | "missing_parent_project"
  | "parent_project_finished"
  | "fixed_amount_exceeds_parent"
  | "invalid_forma_cobro"
  | "duplicate_nombre"
  | "capability_denied"
  | "invalid_transition"
  | "subproject_create_failed"
  | "subproject_update_failed"
  | "subproject_finish_failed"
  | "subproject_reopen_failed"
  | "subproject_hide_failed"
  | "unknown_error";

export interface CreateSubprojectOutcome {
  readonly ok: boolean;
  readonly subprojectId?: string;
  readonly code?: SubprojectCatalogErrorCode;
}

export interface MutateSubprojectOutcome {
  readonly ok: boolean;
  readonly code?: SubprojectCatalogErrorCode;
}

export interface SubprojectCatalogRepository {
  listVisible(input: {
    readonly tenantId: string;
  }): Promise<readonly SubprojectCatalogSummary[]>;

  create(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly proyecto_id: string;
    readonly nombre: string;
    readonly ubicacion?: string;
    readonly forma_cobro?: SubprojectFormaCobro;
    readonly monto_fijo?: number;
  }): Promise<{ readonly id: string }>;

  update(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly nombre: string;
    readonly ubicacion?: string;
    readonly forma_cobro?: SubprojectFormaCobro;
    readonly monto_fijo?: number;
  }): Promise<boolean>;

  finish(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly force: boolean;
    readonly reason?: string;
  }): Promise<boolean>;

  reopen(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly target_estado: SubprojectEstado;
  }): Promise<boolean>;

  hide(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
  }): Promise<boolean>;
}
