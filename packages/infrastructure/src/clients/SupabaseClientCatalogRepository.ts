import { type SupabaseClient } from "@supabase/supabase-js";

import type {
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
    input: ClientPayload & { readonly tenantId: string }
  ): Promise<{ readonly id: string }> {
    const response = await this.client
      .from("clientes")
      .insert({
        tenant_id: input.tenantId,
        ...toClientFields(input),
        estado: "activo" as const,
      })
      .select("id")
      .single();

    if (response.error) {
      throw new Error(response.error.message);
    }

    const data = response.data as { id?: string } | null;
    if (!data?.id) {
      throw new Error("Client creation did not return id.");
    }

    return { id: data.id };
  }

  public async update(
    input: ClientPayload & {
      readonly tenantId: string;
      readonly clientId: string;
    }
  ): Promise<boolean> {
    const response = await this.client
      .from("clientes")
      .update(toClientFields(input), { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.clientId);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.count ?? 0) > 0;
  }

  public async hide(input: {
    readonly tenantId: string;
    readonly clientId: string;
  }): Promise<boolean> {
    const response = await this.client
      .from("clientes")
      .update({ estado: "oculto" as const }, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.clientId);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.count ?? 0) > 0;
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

function toClientFields(input: ClientPayload) {
  return {
    nombre: input.nombre,
    telefono: input.telefono ?? null,
    correo: input.correo ?? null,
    identificacion: input.identificacion ?? null,
    direccion: input.direccion ?? null,
  };
}
