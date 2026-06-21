import type { AuditSource } from "../auth/audit";

export type FuelTypeEstado = "activo" | "oculto";

export interface FuelTypeAuditContext {
  readonly actorId: string;
  readonly auditSource: AuditSource;
}

export interface FuelTypeCatalogSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly nombre: string;
  readonly estado: FuelTypeEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateFuelTypeInput {
  readonly nombre: string;
}

export interface UpdateFuelTypeInput {
  readonly fuelTypeId: string;
  readonly nombre: string;
}

export interface HideFuelTypeInput {
  readonly fuelTypeId: string;
}

export type FuelTypeCatalogErrorCode =
  | "missing_tenant"
  | "missing_fuel_type"
  | "missing_nombre"
  | "capability_denied"
  | "duplicate_active_name"
  | "fuel_type_create_failed"
  | "fuel_type_update_failed"
  | "unknown_error";

export interface CreateFuelTypeOutcome {
  readonly ok: boolean;
  readonly fuelTypeId?: string;
  readonly code?: FuelTypeCatalogErrorCode;
}

export interface MutateFuelTypeOutcome {
  readonly ok: boolean;
  readonly code?: FuelTypeCatalogErrorCode;
}

export interface FuelTypeCatalogRepository {
  listActive(input: {
    readonly tenantId: string;
  }): Promise<readonly FuelTypeCatalogSummary[]>;

  create(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly nombre: string;
  }): Promise<{ readonly id: string }>;

  update(input: {
    readonly tenantId: string;
    readonly fuelTypeId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly nombre: string;
  }): Promise<boolean>;

  hide(input: {
    readonly tenantId: string;
    readonly fuelTypeId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
  }): Promise<boolean>;
}
