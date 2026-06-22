import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  AuditSource,
  ProjectAuditContext,
  ProjectCatalogRepository,
  ProjectCatalogSummary,
  ProjectEstado,
  ProjectFormaCobro,
} from "@faena360/domain";

interface SupabaseProjectRow {
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

type ProjectMutationPayload = {
  readonly actorId: string;
  readonly auditSource: AuditSource;
};

const PROJECT_COLUMNS =
  "id,tenant_id,nombre,cliente_id,ubicacion,fecha_inicio,fecha_finalizacion,forma_cobro,monto_fijo,estado,created_at,updated_at";

export class SupabaseProjectCatalogRepository
  implements ProjectCatalogRepository
{
  public constructor(private readonly client: SupabaseClient) {}

  public async listVisible(input: { readonly tenantId: string })
    : Promise<readonly ProjectCatalogSummary[]> {
    const response = await this.client
      .from("proyectos")
      .select(PROJECT_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .neq("estado", "oculto");

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data as readonly SupabaseProjectRow[]).map(mapProjectRow);
  }

  public async create(
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly auditSource: ProjectAuditContext["auditSource"];
      readonly nombre: string;
      readonly cliente_id: string;
      readonly ubicacion: string;
      readonly fecha_inicio: string;
      readonly forma_cobro: ProjectFormaCobro;
      readonly monto_fijo?: number;
    }
  ): Promise<{ readonly id: string }> {
    const response = await this.client.rpc("create_proyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_nombre: input.nombre,
      p_cliente_id: input.cliente_id,
      p_ubicacion: input.ubicacion,
      p_fecha_inicio: input.fecha_inicio,
      p_forma_cobro: input.forma_cobro,
      p_monto_fijo: input.monto_fijo ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const projectId = response.data as string | null;
    if (!projectId) {
      throw new Error("Project creation did not return id.");
    }

    return { id: projectId };
  }

  public async update(
    input: {
      readonly tenantId: string;
      readonly projectId: string;
      readonly actorId: string;
      readonly auditSource: ProjectAuditContext["auditSource"];
      readonly nombre: string;
      readonly cliente_id: string;
      readonly ubicacion: string;
      readonly fecha_inicio: string;
      readonly forma_cobro: ProjectFormaCobro;
      readonly monto_fijo?: number;
      readonly fecha_finalizacion?: string | null;
    }
  ): Promise<boolean> {
    const response = await this.client.rpc("update_proyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_project_id: input.projectId,
      p_nombre: input.nombre,
      p_cliente_id: input.cliente_id,
      p_ubicacion: input.ubicacion,
      p_fecha_inicio: input.fecha_inicio,
      p_forma_cobro: input.forma_cobro,
      p_monto_fijo: input.monto_fijo ?? null,
      p_fecha_finalizacion: input.fecha_finalizacion ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async pause(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: ProjectAuditContext["auditSource"];
    readonly force: boolean;
    readonly reason?: string;
  }): Promise<boolean> {
    const response = await this.client.rpc("pause_proyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_project_id: input.projectId,
      p_force: input.force,
      p_reason: input.reason ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async finish(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: ProjectAuditContext["auditSource"];
    readonly force: boolean;
    readonly reason?: string;
  }): Promise<boolean> {
    const response = await this.client.rpc("finish_proyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_project_id: input.projectId,
      p_force: input.force,
      p_reason: input.reason ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async reopen(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: ProjectAuditContext["auditSource"];
    readonly target_estado: ProjectEstado;
  }): Promise<boolean> {
    const response = await this.client.rpc("reopen_proyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_project_id: input.projectId,
      p_target_estado: input.target_estado,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async hide(input: {
    readonly tenantId: string;
    readonly projectId: string;
    readonly actorId: string;
    readonly auditSource: ProjectAuditContext["auditSource"];
  }): Promise<boolean> {
    const response = await this.client.rpc("hide_proyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_project_id: input.projectId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }
}

function mapProjectRow(row: SupabaseProjectRow): ProjectCatalogSummary {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    nombre: row.nombre,
    cliente_id: row.cliente_id,
    ubicacion: row.ubicacion,
    fecha_inicio: row.fecha_inicio,
    fecha_finalizacion: row.fecha_finalizacion,
    forma_cobro: row.forma_cobro,
    monto_fijo: row.monto_fijo,
    estado: row.estado,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
