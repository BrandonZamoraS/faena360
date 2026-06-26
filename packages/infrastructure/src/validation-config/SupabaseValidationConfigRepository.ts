import type {
  UserCapabilityOverrideInput,
  ValidationConfigRepository,
} from "@faena360/application";
import type { SupabaseClient } from "@supabase/supabase-js";

type TenantRow = {
  readonly id: string;
  readonly status: string;
};

type UserProfileRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly status: string;
};

type UserRoleRow = { readonly role_id: string };
type RoleRow = {
  readonly id: string;
  readonly tenant_id: string;
};
type RoleCapabilityRow = {
  readonly role_id: string;
  readonly capability_id: string;
};
type CapabilityRow = { readonly id: string; readonly key: string };
type OverrideRow = {
  readonly capability_id: string;
  readonly grant_type: "allow" | "deny";
};
type TenantValidationConfigRow = {
  readonly config: unknown;
};

export class SupabaseValidationConfigRepository implements ValidationConfigRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getTenantUserContext(input: {
    readonly tenantId: string;
    readonly userId: string;
  }) {
    const [tenant, user] = await Promise.all([
      this.client
        .from("tenants")
        .select("id, status")
        .eq("id", input.tenantId)
        .maybeSingle<TenantRow>(),
      this.client
        .from("user_profiles")
        .select("id, tenant_id, status")
        .eq("tenant_id", input.tenantId)
        .eq("id", input.userId)
        .maybeSingle<UserProfileRow>(),
    ]);

    if (tenant.error) throw new Error(tenant.error.message);
    if (user.error) throw new Error(user.error.message);
    if (!tenant.data || !user.data) return null;

    return {
      tenantId: tenant.data.id,
      userId: user.data.id,
      tenantStatus: tenant.data.status,
      userStatus: user.data.status,
    };
  }

  async getTenantOverride(input: {
    readonly tenantId: string;
    readonly tipo: string;
  }): Promise<unknown | null> {
    const result = await this.client
      .from("tenant_validation_configs")
      .select("config")
      .eq("tenant_id", input.tenantId)
      .eq("tipo", input.tipo)
      .maybeSingle<TenantValidationConfigRow>();

    if (result.error) throw new Error(result.error.message);
    return result.data?.config ?? null;
  }

  async listUserRoleIds(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<readonly string[]> {
    const rows = await this.ensureRows<UserRoleRow>(
      await this.client
        .from("user_roles")
        .select("role_id")
        .eq("tenant_id", input.tenantId)
        .eq("user_id", input.userId),
      "User roles lookup failed"
    );

    return [...new Set(rows.map((row) => row.role_id).filter(Boolean))];
  }

  async listCapabilitiesForRoles(input: {
    readonly tenantId: string;
    readonly roleIds: readonly string[];
  }): Promise<readonly string[]> {
    const roleIds = [...new Set(input.roleIds.filter(Boolean))];
    if (roleIds.length === 0) return [];

    const [roleCapabilities, roles] = await Promise.all([
      this.ensureRows<RoleCapabilityRow>(
        await this.client
          .from("role_capabilities")
          .select("role_id, capability_id")
          .in("role_id", roleIds),
        "Role capability lookup failed"
      ),
      this.ensureRows<RoleRow>(
        await this.client
          .from("roles")
          .select("id, tenant_id")
          .eq("tenant_id", input.tenantId)
          .in("id", roleIds),
        "Role lookup failed"
      ),
    ]);

    const allowedRoleIds = new Set(roles.map((role) => role.id));
    const capabilityIds = [
      ...new Set(
        roleCapabilities
          .filter((row) => allowedRoleIds.has(row.role_id))
          .map((row) => row.capability_id)
      ),
    ];
    if (capabilityIds.length === 0) return [];

    const capabilities = await this.ensureRows<CapabilityRow>(
      await this.client
        .from("capabilities")
        .select("id, key")
        .in("id", capabilityIds),
      "Capability lookup failed"
    );

    return [...new Set(capabilities.map((row) => row.key))];
  }

  async listUserCapabilityOverrides(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<readonly UserCapabilityOverrideInput[]> {
    const overrides = await this.ensureRows<OverrideRow>(
      await this.client
        .from("user_capability_overrides")
        .select("capability_id, grant_type")
        .eq("tenant_id", input.tenantId)
        .eq("user_id", input.userId),
      "User capability override lookup failed"
    );
    if (overrides.length === 0) return [];

    const capabilityIds = [
      ...new Set(overrides.map((override) => override.capability_id)),
    ];
    const capabilities = await this.ensureRows<CapabilityRow>(
      await this.client
        .from("capabilities")
        .select("id, key")
        .in("id", capabilityIds),
      "Capability lookup failed"
    );
    const keyById = new Map(capabilities.map((row) => [row.id, row.key]));

    return overrides.map((override) => ({
      capabilityCode:
        keyById.get(override.capability_id) ?? override.capability_id,
      effect: override.grant_type,
    }));
  }

  private ensureRows<T>(
    result: {
      readonly data: T[] | null;
      readonly error: { readonly message?: string } | null;
    },
    message: string
  ): T[] {
    if (result.error) throw new Error(result.error.message ?? message);
    return result.data ?? [];
  }
}
