import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  MachineAuditContext,
  MachineCatalogRepository,
  MachineCatalogSummary,
  MachineEstado,
  MachineFuelMeasurementMode,
  MachineTipo,
} from "@faena360/domain";

type SupabaseMachineRow = MachineCatalogSummary;

const MACHINE_COLUMNS =
  "id,tenant_id,codigo,placa,tipo,tipo_combustible_id,tamanio_tanque,modo_medicion_combustible,nivel_inicial_combustible,capacidad_transporte_m3,tarifa_sugerida,estado,created_at,updated_at";

export class SupabaseMachineCatalogRepository implements MachineCatalogRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async listVisible(input: {
    readonly tenantId: string;
  }): Promise<readonly MachineCatalogSummary[]> {
    const response = await this.client
      .from("maquinas")
      .select(MACHINE_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .neq("estado", "oculta")
      .order("codigo", { ascending: true });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data as readonly SupabaseMachineRow[]).map((row) => row);
  }

  public async create(
    input: {
      readonly tenantId: string;
    } & MachineAuditContext & {
        readonly codigo: string;
        readonly placa: string | null;
        readonly tipo: MachineTipo;
        readonly tipo_combustible_id: string;
        readonly tamanio_tanque: number;
        readonly modo_medicion_combustible: MachineFuelMeasurementMode;
        readonly nivel_inicial_combustible?: number | null;
        readonly capacidad_transporte_m3?: number | null;
        readonly tarifa_sugerida?: number | null;
      }
  ): Promise<{ readonly id: string }> {
    const response = await this.client.rpc("create_maquina", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_codigo: input.codigo,
      p_placa: input.placa,
      p_tipo: input.tipo,
      p_tipo_combustible_id: input.tipo_combustible_id,
      p_tamanio_tanque: input.tamanio_tanque,
      p_modo_medicion_combustible: input.modo_medicion_combustible,
      p_nivel_inicial_combustible: input.nivel_inicial_combustible ?? null,
      p_capacidad_transporte_m3: input.capacidad_transporte_m3 ?? null,
      p_tarifa_sugerida: input.tarifa_sugerida ?? null,
    });
    if (response.error) {
      throw createRepositoryError(response.error);
    }
    if (!response.data) {
      throw new Error("Machine creation did not return id.");
    }
    return { id: response.data as string };
  }

  public async update(
    input: {
      readonly tenantId: string;
      readonly machineId: string;
    } & MachineAuditContext & {
        readonly codigo: string;
        readonly placa: string | null;
        readonly tipo: MachineTipo;
        readonly tipo_combustible_id: string;
        readonly tamanio_tanque: number;
        readonly modo_medicion_combustible: MachineFuelMeasurementMode;
        readonly nivel_inicial_combustible?: number | null;
        readonly capacidad_transporte_m3?: number | null;
        readonly tarifa_sugerida?: number | null;
      }
  ): Promise<boolean> {
    const response = await this.client.rpc("update_maquina", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_machine_id: input.machineId,
      p_codigo: input.codigo,
      p_placa: input.placa,
      p_tipo: input.tipo,
      p_tipo_combustible_id: input.tipo_combustible_id,
      p_tamanio_tanque: input.tamanio_tanque,
      p_modo_medicion_combustible: input.modo_medicion_combustible,
      p_nivel_inicial_combustible: input.nivel_inicial_combustible ?? null,
      p_capacidad_transporte_m3: input.capacidad_transporte_m3 ?? null,
      p_tarifa_sugerida: input.tarifa_sugerida ?? null,
    });
    if (response.error) {
      throw createRepositoryError(response.error);
    }
    return Boolean(response.data);
  }

  public async changeStatus(input: {
    readonly tenantId: string;
    readonly machineId: string;
    readonly actorId: string;
    readonly auditSource: MachineAuditContext["auditSource"];
    readonly estado: MachineEstado;
  }): Promise<boolean> {
    const response = await this.client.rpc("change_maquina_estado", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_machine_id: input.machineId,
      p_estado: input.estado,
    });
    if (response.error) {
      throw createRepositoryError(response.error);
    }
    return Boolean(response.data);
  }
}

function createRepositoryError(supabaseError: {
  message: string;
  code?: string;
}): Error {
  const error = new Error(supabaseError.message) as Error & { code?: string };
  error.code = supabaseError.code;
  return error;
}
