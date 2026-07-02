import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  AuditSource,
  SubprojectAuditContext,
  SubprojectCatalogRepository,
  SubprojectCatalogSummary,
  SubprojectEstado,
  SubprojectFormaCobro,
} from "@faena360/domain";

interface SupabaseSubprojectRow {
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

const SUBPROJECT_COLUMNS =
  "id,tenant_id,proyecto_id,nombre,ubicacion,forma_cobro,monto_fijo,estado,created_at,updated_at";

export class SupabaseSubprojectCatalogRepository implements SubprojectCatalogRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async listVisible(input: {
    readonly tenantId: string;
  }): Promise<readonly SubprojectCatalogSummary[]> {
    // Query hidden project IDs so we can exclude subprojects whose parent is
    // hidden. This is necessary because service_role bypasses RLS, which
    // normally excludes subprojects under hidden parents.
    const hiddenProjectsResponse = await this.client
      .from("proyectos")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("estado", "oculto");

    if (hiddenProjectsResponse.error) {
      throw new Error(hiddenProjectsResponse.error.message);
    }

    const hiddenProjectIds = (
      hiddenProjectsResponse.data as readonly { id: string }[]
    ).map((p) => p.id);

    let query = this.client
      .from("subproyectos")
      .select(SUBPROJECT_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .neq("estado", "oculto");

    if (hiddenProjectIds.length > 0) {
      query = query.not("proyecto_id", "in", `(${hiddenProjectIds.join(",")})`);
    }

    const response = await query;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data as readonly SupabaseSubprojectRow[]).map(
      mapSubprojectRow
    );
  }

  public async create(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly auditSource: SubprojectAuditContext["auditSource"];
    readonly proyecto_id: string;
    readonly nombre: string;
    readonly ubicacion?: string;
    readonly forma_cobro?: SubprojectFormaCobro;
    readonly monto_fijo?: number;
  }): Promise<{ readonly id: string }> {
    const response = await this.client.rpc("create_subproyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_proyecto_id: input.proyecto_id,
      p_nombre: input.nombre,
      p_ubicacion: input.ubicacion ?? null,
      p_forma_cobro: input.forma_cobro ?? null,
      p_monto_fijo: input.monto_fijo ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const subprojectId = response.data as string | null;
    if (!subprojectId) {
      throw new Error("Subproject creation did not return id.");
    }

    return { id: subprojectId };
  }

  public async update(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: SubprojectAuditContext["auditSource"];
    readonly nombre: string;
    readonly ubicacion?: string;
    readonly forma_cobro?: SubprojectFormaCobro;
    readonly monto_fijo?: number;
  }): Promise<boolean> {
    const response = await this.client.rpc("update_subproyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_subproject_id: input.subprojectId,
      p_nombre: input.nombre,
      p_ubicacion: input.ubicacion ?? null,
      p_forma_cobro: input.forma_cobro ?? null,
      p_monto_fijo: input.monto_fijo ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async finish(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: SubprojectAuditContext["auditSource"];
    readonly force: boolean;
    readonly reason?: string;
  }): Promise<boolean> {
    const response = await this.client.rpc("finish_subproyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_subproject_id: input.subprojectId,
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
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: SubprojectAuditContext["auditSource"];
    readonly target_estado: SubprojectEstado;
  }): Promise<boolean> {
    const response = await this.client.rpc("reopen_subproyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_subproject_id: input.subprojectId,
      p_target_estado: input.target_estado,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  public async hide(input: {
    readonly tenantId: string;
    readonly subprojectId: string;
    readonly actorId: string;
    readonly auditSource: SubprojectAuditContext["auditSource"];
  }): Promise<boolean> {
    const response = await this.client.rpc("hide_subproyecto", {
      p_actor_id: input.actorId,
      p_audit_source: input.auditSource,
      p_tenant_id: input.tenantId,
      p_subproject_id: input.subprojectId,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  // ── Extended repository methods (used by application service) ──

  /**
   * Returns the parent project's monto_fijo, or null if not set (or project
   * is not monto_fijo).
   */
  public async getParentFixedAmount(
    tenantId: string,
    proyecto_id: string
  ): Promise<number | null> {
    const response = await this.client
      .from("proyectos")
      .select("monto_fijo, forma_cobro")
      .eq("tenant_id", tenantId)
      .eq("id", proyecto_id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    const row = response.data as {
      monto_fijo: number | null;
      forma_cobro: string;
    } | null;

    if (!row || row.forma_cobro !== "monto_fijo" || row.monto_fijo === null) {
      return null;
    }

    return row.monto_fijo;
  }

  /**
   * Returns the authoritative proyecto_id for a subproject (server-sourced).
   * Used to validate against client-supplied proyecto_id in update flows.
   */
  public async getProjectId(
    tenantId: string,
    subprojectId: string
  ): Promise<string | null> {
    const response = await this.client
      .from("subproyectos")
      .select("proyecto_id")
      .eq("tenant_id", tenantId)
      .eq("id", subprojectId)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    const row = response.data as { proyecto_id: string } | null;
    return row?.proyecto_id ?? null;
  }

  /**
   * Returns the sum of monto_fijo for all non-hidden sibling subprojects
   * under the same proyecto_id. Optionally excludes a specific subproject
   * (used for update operations to avoid double-counting).
   */
  public async getSubprojectFixedAmountSum(
    tenantId: string,
    proyecto_id: string,
    excludeSubprojectId?: string
  ): Promise<number> {
    let query = this.client
      .from("subproyectos")
      .select("monto_fijo")
      .eq("tenant_id", tenantId)
      .eq("proyecto_id", proyecto_id)
      .neq("estado", "oculto");

    if (excludeSubprojectId) {
      query = query.neq("id", excludeSubprojectId);
    }

    const response = await query;

    if (response.error) {
      throw new Error(response.error.message);
    }

    const rows = response.data as readonly { monto_fijo: number | null }[];

    return rows.reduce((sum, row) => sum + (row.monto_fijo ?? 0), 0);
  }
}

function mapSubprojectRow(
  row: SupabaseSubprojectRow
): SubprojectCatalogSummary {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    proyecto_id: row.proyecto_id,
    nombre: row.nombre,
    ubicacion: row.ubicacion,
    forma_cobro: row.forma_cobro,
    monto_fijo: row.monto_fijo,
    estado: row.estado,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
