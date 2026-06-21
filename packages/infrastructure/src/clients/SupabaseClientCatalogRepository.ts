import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  ClientAuditContext,
  ClientCatalogRepository,
  ClientCatalogSummary,
  ClienteEstado,
} from "@faena360/domain";

interface SupabaseClientRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly identificacion: string | null;
  readonly direccion: string | null;
  readonly estado: ClienteEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

type ClientPayload = {
  readonly nombre: string;
  readonly telefono?: string;
  readonly correo?: string;
  readonly identificacion?: string;
  readonly direccion?: string;
};

const CLIENT_COLUMNS =
  "id,tenant_id,nombre,telefono,correo,identificacion,direccion,estado,created_at,updated_at";

export class SupabaseClientCatalogRepository implements ClientCatalogRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async listActive(input: {
    readonly tenantId: string;
  }): Promise<readonly ClientCatalogSummary[]> {
    const response = await this.client
      .from("clientes")
      .select(CLIENT_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .eq("estado", "activo");

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data as readonly SupabaseClientRow[]).map(mapClientRow);
  }

  public async create(
    input: ClientPayload & { readonly tenantId: string } & ClientAuditContext
  ): Promise<{ readonly id: string }> {
    const response = await this.client.rpc("create_cliente", {
      ...toClientRpcFields(input),
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const clientId = response.data as string | null;
    if (!clientId) {
      throw new Error("Client creation did not return id.");
    }

    return { id: clientId };
  }

  public async update(
    input: ClientPayload & {
      readonly tenantId: string;
      readonly clientId: string;
    } & ClientAuditContext
  ): Promise<boolean> {
    const response = await this.client.rpc("update_cliente", {
      ...toClientRpcFields(input),
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_client_id: input.clientId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async hide(input: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly actorId: string;
    readonly auditSource: ClientAuditContext["auditSource"];
  }): Promise<boolean> {
    const response = await this.client.rpc("hide_cliente", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_client_id: input.clientId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }
}

function mapClientRow(row: SupabaseClientRow): ClientCatalogSummary {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    nombre: row.nombre,
    telefono: row.telefono ?? null,
    correo: row.correo ?? null,
    identificacion: row.identificacion ?? null,
    direccion: row.direccion ?? null,
    estado: row.estado,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toClientRpcFields(input: ClientPayload) {
  return {
    p_nombre: input.nombre,
    p_telefono: input.telefono ?? null,
    p_correo: input.correo ?? null,
    p_identificacion: input.identificacion ?? null,
    p_direccion: input.direccion ?? null,
  };
}
