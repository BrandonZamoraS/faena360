import type {
  AppSessionRepository,
  UserCapabilityOverride,
} from "@faena360/application";
import type { SupabaseClient } from "@supabase/supabase-js";

type TenantRow = {
  id: string;
  status: string;
};

type UserProfileRow = {
  id: string;
  email: string | null;
  status: "active" | "inactive";
  tenant_id: string;
};

type UserRoleRow = {
  role_id: string;
};

type RoleCapabilityRow = {
  role_id: string;
  capability_id: string;
};

type RoleRow = {
  id: string;
  tenant_id: string;
  is_web_access: boolean | null;
};

type CapabilityLookupRow = {
  id: string;
  key: string;
};

type CapabilityOverrideRow = {
  capability_id: string;
  grant_type: "allow" | "deny";
};

/**
 * Adapts Supabase tenant/auth tables to application session repository contract.
 *
 * Capa Infrastructure: traduce consultas Supabase al puerto que Application
 * entiende. La regla de negocio no vive acá; este archivo solo sabe cómo leer
 * tablas, mapear columnas snake_case y propagar errores de persistencia.
 */
export class SupabaseAppSessionRepository implements AppSessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getTenant(input: {
    tenantId: string;
  }): Promise<{ id: string; status: string }> {
    const { data, error } = await this.client
      .from("tenants")
      .select("id, status")
      .eq("id", input.tenantId)
      .maybeSingle<TenantRow>();

    if (error || !data) {
      throw new Error(error?.message ?? "Tenant not found");
    }

    return {
      id: data.id,
      status: data.status,
    };
  }

  async getUserProfile(input: {
    tenantId: string;
    authUserId: string;
  }): Promise<{
    readonly userId: string;
    readonly email?: string | null;
    readonly status: "active" | "inactive";
    readonly tenantId: string;
  } | null> {
    // El perfil local une el usuario autenticado por Supabase con el usuario de
    // negocio de Faena360. Por eso se filtra también por tenant: evita mezclar
    // identidades entre tenants aunque el auth_user_id sea válido.
    const { data, error } = await this.client
      .from("user_profiles")
      .select("id, email, status, tenant_id")
      .eq("tenant_id", input.tenantId)
      .eq("auth_user_id", input.authUserId)
      .maybeSingle<UserProfileRow>();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return null;
    }

    return {
      userId: data.id,
      email: data.email,
      status: data.status,
      tenantId: data.tenant_id,
    };
  }

  async listUserRoles(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly string[]> {
    const { data, error } = await this.client
      .from("user_roles")
      .select("role_id")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId);

    if (error) {
      throw new Error(error.message);
    }

    const roles =
      data
        ?.map((item: UserRoleRow) => item.role_id)
        .filter((value) => !!value) ?? [];

    return [...new Set(roles)];
  }

  async hasWebAccessRole(input: {
    tenantId: string;
    userId: string;
    roleIds?: readonly string[];
  }): Promise<boolean> {
    // Este método solo responde si algún rol asignado tiene la marca estructural
    // de acceso web. La capacidad fina `web.portal.access` se resuelve aparte en
    // Application para mantener separadas la pertenencia al rol y los permisos.
    const explicitRoleIds = input.roleIds
      ? Array.from(new Set(input.roleIds)).filter(
          (roleId) => roleId.trim().length > 0
        )
      : null;

    if (explicitRoleIds && explicitRoleIds.length === 0) {
      return false;
    }

    const roleIds =
      explicitRoleIds ??
      (await this.listUserRoles({
        tenantId: input.tenantId,
        userId: input.userId,
      }));

    if (roleIds.length === 0) {
      return false;
    }

    const { data, error } = await this.client
      .from("roles")
      .select("is_web_access")
      .eq("tenant_id", input.tenantId)
      .in("id", roleIds);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).some((item) => item.is_web_access === true);
  }

  async listTenantRoleCapabilities(input: {
    tenantId: string;
    roleIds: readonly string[];
  }): Promise<readonly string[]> {
    // Las capacidades se filtran por roles del mismo tenant para que un role_id
    // ajeno no pueda contaminar el conjunto efectivo de permisos.
    const normalizedRoleIds = Array.from(new Set(input.roleIds)).filter(
      (roleId) => roleId.trim().length > 0
    );

    if (normalizedRoleIds.length === 0) {
      return [];
    }

    const [roleCapabilityResult, roleResult] = await Promise.all([
      this.client
        .from("role_capabilities")
        .select("role_id, capability_id")
        .in("role_id", normalizedRoleIds)
        .then((result) =>
          this.ensureRows<RoleCapabilityRow>(
            result as {
              data: RoleCapabilityRow[] | null;
              error: { message: string } | null;
            },
            "Role capability lookup failed"
          )
        ),
      this.client
        .from("roles")
        .select("id, tenant_id, is_web_access")
        .eq("tenant_id", input.tenantId)
        .in("id", normalizedRoleIds)
        .then((result) =>
          this.ensureRows<RoleRow>(
            result as {
              data: RoleRow[] | null;
              error: { message: string } | null;
            },
            "Role lookup for web access failed"
          )
        ),
    ]);

    const allowedRoleIds = new Set(roleResult.map((row) => row.id));
    const roleCapabilities = roleCapabilityResult.filter((row) =>
      allowedRoleIds.has(row.role_id)
    );

    const capabilityIds = Array.from(
      new Set(roleCapabilities.map((row) => row.capability_id))
    );

    if (capabilityIds.length === 0) {
      return [];
    }

    const capabilityRows = await this.client
      .from("capabilities")
      .select("id, key")
      .in("id", capabilityIds)
      .then((result) =>
        this.ensureRows<CapabilityLookupRow>(
          result as {
            data: CapabilityLookupRow[] | null;
            error: { message: string } | null;
          },
          "Capability lookup for role capabilities failed"
        )
      );

    return Array.from(new Set(capabilityRows.map((row) => row.key)));
  }

  async listUserCapabilityOverrides(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly UserCapabilityOverride[]> {
    const overrides = await this.client
      .from("user_capability_overrides")
      .select("capability_id, grant_type")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId)
      .then((result) =>
        this.ensureRows<CapabilityOverrideRow>(
          result as {
            data: CapabilityOverrideRow[] | null;
            error: { message: string } | null;
          },
          "User capability override lookup failed"
        )
      );

    if (overrides.length === 0) {
      return [];
    }

    const capabilityIds = Array.from(
      new Set(overrides.map((item) => item.capability_id))
    );

    const capabilities = await this.client
      .from("capabilities")
      .select("id, key")
      .in("id", capabilityIds)
      .then((result) =>
        this.ensureRows<CapabilityLookupRow>(
          result as {
            data: CapabilityLookupRow[] | null;
            error: { message: string } | null;
          },
          "Capability lookup for user overrides failed"
        )
      );

    const keyById = new Map(capabilities.map((row) => [row.id, row.key]));

    return overrides.map((item) => ({
      capabilityCode: keyById.get(item.capability_id) ?? item.capability_id,
      effect: item.grant_type,
    }));
  }

  private ensureRows<T extends { [k: string]: unknown }>(
    result: {
      data: T[] | null;
      error: { message?: string } | null;
    },
    message: string
  ): T[] {
    if (result.error) {
      throw new Error(result.error.message ?? message);
    }

    return result.data ?? [];
  }
}
