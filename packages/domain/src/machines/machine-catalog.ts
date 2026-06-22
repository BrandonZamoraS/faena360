import type { AuditSource } from "../auth/audit";

export type MachineTipo = "acarreo" | "por_tiempo";
export type MachineEstado =
  | "activa"
  | "en_mantenimiento"
  | "fuera_de_servicio"
  | "oculta";
export type MachineFuelMeasurementMode =
  | "exacto"
  | "aproximado_porcentaje"
  | "sin_medicion";

export interface MachineAuditContext {
  readonly actorId: string;
  readonly auditSource: AuditSource;
}

export interface MachineCatalogSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly codigo: string;
  readonly placa: string | null;
  readonly tipo: MachineTipo;
  readonly tipo_combustible_id: string;
  readonly tamanio_tanque: number;
  readonly modo_medicion_combustible: MachineFuelMeasurementMode;
  readonly nivel_inicial_combustible: number | null;
  readonly capacidad_transporte_m3: number | null;
  readonly tarifa_sugerida: number | null;
  readonly estado: MachineEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateMachineInput {
  readonly codigo: string;
  readonly placa?: string | null;
  readonly tipo?: string;
  readonly tipo_combustible_id: string;
  readonly tamanio_tanque: number;
  readonly modo_medicion_combustible?: string;
  readonly nivel_inicial_combustible?: number | null;
  readonly capacidad_transporte_m3?: number | null;
  readonly tarifa_sugerida?: number | null;
}

export interface UpdateMachineInput extends CreateMachineInput {
  readonly machineId: string;
}

export interface ChangeMachineStatusInput {
  readonly machineId: string;
  readonly estado: string;
}

export interface HideMachineInput {
  readonly machineId: string;
}

export type MachineCatalogErrorCode =
  | "missing_tenant"
  | "missing_machine"
  | "missing_codigo"
  | "missing_tipo_combustible"
  | "invalid_tipo"
  | "invalid_tamanio_tanque"
  | "invalid_modo_medicion_combustible"
  | "invalid_nivel_inicial_combustible"
  | "invalid_capacidad_transporte_m3"
  | "invalid_tarifa_sugerida"
  | "invalid_estado"
  | "capability_denied"
  | "duplicate_codigo"
  | "machine_create_failed"
  | "machine_update_failed"
  | "machine_status_change_failed"
  | "type_locked_by_operational_records"
  | "unknown_error";

export interface CreateMachineOutcome {
  readonly ok: boolean;
  readonly machineId?: string;
  readonly code?: MachineCatalogErrorCode;
}

export interface MutateMachineOutcome {
  readonly ok: boolean;
  readonly code?: MachineCatalogErrorCode;
}

export interface MachineCatalogRepository {
  listVisible(input: {
    readonly tenantId: string;
  }): Promise<readonly MachineCatalogSummary[]>;

  create(
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly auditSource: AuditSource;
    } & Omit<CreateMachineInput, "tipo" | "modo_medicion_combustible"> & {
        readonly tipo: MachineTipo;
        readonly modo_medicion_combustible: MachineFuelMeasurementMode;
        readonly placa: string | null;
      }
  ): Promise<{ readonly id: string }>;

  update(
    input: {
      readonly tenantId: string;
      readonly machineId: string;
      readonly actorId: string;
      readonly auditSource: AuditSource;
    } & Omit<
      UpdateMachineInput,
      "machineId" | "tipo" | "modo_medicion_combustible"
    > & {
        readonly tipo: MachineTipo;
        readonly modo_medicion_combustible: MachineFuelMeasurementMode;
        readonly placa: string | null;
      }
  ): Promise<boolean>;

  changeStatus(input: {
    readonly tenantId: string;
    readonly machineId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly estado: MachineEstado;
  }): Promise<boolean>;
}
