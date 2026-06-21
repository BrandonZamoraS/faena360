import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  FuelTypeAuditContext,
  FuelTypeCatalogRepository,
  FuelTypeCatalogSummary,
  FuelTypeEstado,
} from "@faena360/domain";

interface SupabaseFuelTypeRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly nombre: string;
  readonly estado: FuelTypeEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

type FuelTypePayload = {
  readonly nombre: string;
};

const FUEL_TYPE_COLUMNS =
  "id,tenant_id,nombre,estado,created_at,updated_at";

export class SupabaseFuelTypeCatalogRepository implements FuelTypeCatalogRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async listActive(input: {
    readonly tenantId: string;
  }): Promise<readonly FuelTypeCatalogSummary[]> {
    const response = await this.client
      .from("tipos_combustible")
      .select(FUEL_TYPE_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .eq("estado", "activo")
      .order("nombre", { ascending: true });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data as readonly SupabaseFuelTypeRow[]).map(mapFuelTypeRow);
  }

  public async create(
    input: FuelTypePayload & { readonly tenantId: string } & FuelTypeAuditContext
  ): Promise<{ readonly id: string }> {
    const response = await this.client.rpc("create_tipo_combustible", {
      p_nombre: input.nombre,
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const fuelTypeId = response.data as string | null;
    if (!fuelTypeId) {
      throw new Error("Fuel type creation did not return id.");
    }

    return { id: fuelTypeId };
  }

  public async update(
    input: FuelTypePayload & {
      readonly tenantId: string;
      readonly fuelTypeId: string;
    } & FuelTypeAuditContext
  ): Promise<boolean> {
    const response = await this.client.rpc("update_tipo_combustible", {
      p_nombre: input.nombre,
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_fuel_type_id: input.fuelTypeId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async hide(input: {
    readonly tenantId: string;
    readonly fuelTypeId: string;
    readonly actorId: string;
    readonly auditSource: FuelTypeAuditContext["auditSource"];
  }): Promise<boolean> {
    const response = await this.client.rpc("hide_tipo_combustible", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_fuel_type_id: input.fuelTypeId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }
}

function mapFuelTypeRow(row: SupabaseFuelTypeRow): FuelTypeCatalogSummary {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    nombre: row.nombre,
    estado: row.estado,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
