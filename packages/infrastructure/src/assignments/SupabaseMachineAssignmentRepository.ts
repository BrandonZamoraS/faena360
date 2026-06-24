import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  AssignmentEstado,
  MachineAssignment,
  MachineAssignmentRepository,
} from "@faena360/domain";

interface AssignmentJoinRow {
  id: string;
  tenant_id: string;
  maquina_id: string;
  proyecto_id: string;
  subproyecto_id: string | null;
  operador_id: string;
  tarifa_aplicada: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  created_at: string;
  updated_at: string;
}

export class SupabaseMachineAssignmentRepository
  implements MachineAssignmentRepository
{
  public constructor(private readonly client: SupabaseClient) {}

  public async listActive(input: {
    readonly tenantId: string;
  }): Promise<readonly MachineAssignment[]> {
    const response = await this.client.rpc("list_asignaciones_activas", {
      p_tenant_id: input.tenantId,
    });

    if (response.error) {
      throw createRepositoryError(response.error);
    }

    const rows = response.data as AssignmentJoinRow[] | null;
    if (!rows) {
      return [];
    }

    return rows.map(mapRowToAssignment);
  }

  public async create(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly auditSource: "web" | "whatsapp" | "script" | "system";
    readonly maquina_id: string;
    readonly proyecto_id: string;
    readonly subproyecto_id?: string | null;
    readonly operador_id: string;
    readonly tarifa_aplicada: number;
  }): Promise<{ readonly id: string }> {
    const response = await this.client.rpc("create_asignacion", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_maquina_id: input.maquina_id,
      p_proyecto_id: input.proyecto_id,
      p_subproyecto_id: input.subproyecto_id ?? null,
      p_operador_id: input.operador_id,
      p_tarifa_aplicada: input.tarifa_aplicada,
    });

    if (response.error) {
      throw createRepositoryError(response.error);
    }

    if (!response.data) {
      throw new Error("Assignment creation did not return id.");
    }

    return { id: response.data as string };
  }

  public async updateStatus(input: {
    readonly tenantId: string;
    readonly assignmentId: string;
    readonly actorId: string;
    readonly auditSource: "web" | "whatsapp" | "script" | "system";
    readonly estado: AssignmentEstado;
  }): Promise<boolean> {
    const response = await this.client.rpc("update_asignacion", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_asignacion_id: input.assignmentId,
      p_estado: input.estado,
    });

    if (response.error) {
      throw createRepositoryError(response.error);
    }

    return Boolean(response.data);
  }
}

function mapRowToAssignment(row: AssignmentJoinRow): MachineAssignment {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    maquina_id: row.maquina_id,
    proyecto_id: row.proyecto_id,
    subproyecto_id: row.subproyecto_id,
    operador_id: row.operador_id,
    tarifa_aplicada: row.tarifa_aplicada,
    estado: row.estado as AssignmentEstado,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createRepositoryError(supabaseError: {
  message: string;
  code?: string;
}): Error {
  const error = new Error(supabaseError.message) as Error & { code?: string };
  error.code = supabaseError.code;
  return error;
}
