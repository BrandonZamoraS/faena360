import type {
  WhatsappIdentityRepository,
  WhatsappIdentityRole,
} from "@faena360/application";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileLookupRow = {
  readonly user_id: string;
  readonly user_name: string;
  readonly user_status: "active" | "inactive";
  readonly tenant_id: string;
};

type TenantRow = {
  readonly id: string;
  readonly status: string;
};

type UserRoleRow = { readonly role_id: string };
type RoleRow = {
  readonly id: string;
  readonly name: string;
  readonly is_web_access: boolean | null;
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

export class SupabaseWhatsappIdentityRepository implements WhatsappIdentityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByNormalizedPhone(input: { readonly phone: string }) {
    const profile = await this.client.rpc("find_whatsapp_identity_by_phone", {
      lookup_phone: input.phone,
    });
    if (profile.error) {
      throw new Error(profile.error.message);
    }
    const profileRow = Array.isArray(profile.data)
      ? (profile.data[0] as ProfileLookupRow | undefined)
      : (profile.data as ProfileLookupRow | null);
    if (!profileRow) return null;

    const tenant = await this.client
      .from("tenants")
      .select("id, status")
      .eq("id", profileRow.tenant_id)
      .maybeSingle<TenantRow>();
    if (tenant.error || !tenant.data) {
      throw new Error(tenant.error?.message ?? "Tenant not found");
    }
    return {
      userId: profileRow.user_id,
      userName: profileRow.user_name,
      tenantId: tenant.data.id,
      userStatus: profileRow.user_status,
      tenantStatus: tenant.data.status,
    };
  }

  async listRoleAssignments(input: {
    readonly tenantId: string;
    readonly userId: string;
  }) {
    const userRoles = await this.ensureRows<UserRoleRow>(
      await this.client
        .from("user_roles")
        .select("role_id")
        .eq("tenant_id", input.tenantId)
        .eq("user_id", input.userId),
      "User roles lookup failed"
    );
    const roleIds = [
      ...new Set(userRoles.map((row) => row.role_id).filter(Boolean)),
    ];
    if (roleIds.length === 0) return [];
    const roles = await this.ensureRows<RoleRow>(
      await this.client
        .from("roles")
        .select("id, name, is_web_access")
        .eq("tenant_id", input.tenantId)
        .in("id", roleIds),
      "Role lookup failed"
    );
    return roles.map<WhatsappIdentityRole>((role) => ({
      roleId: role.id,
      roleName: role.name,
      isWebAccess: role.is_web_access === true,
    }));
  }

  async listCapabilitiesForRoles(input: {
    readonly tenantId: string;
    readonly roleIds: readonly string[];
  }) {
    const roleIds = [
      ...new Set(input.roleIds.filter((roleId) => roleId.trim().length > 0)),
    ];
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
          .select("id, name, is_web_access")
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
  }) {
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
      ...new Set(overrides.map((row) => row.capability_id)),
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
