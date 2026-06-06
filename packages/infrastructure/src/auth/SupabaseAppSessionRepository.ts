import type {
  AppSessionRepository,
  UserCapabilityOverride,
} from "../../../application/src/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const WEB_ACCESS_CAPABILITY = "web.portal.access";

type TenantRow = {
  id: string;
  status: string;
};

type UserProfileRow = {
  user_id: string;
  email: string;
  status: "active" | "inactive";
  tenant_id: string;
};

type UserRoleRow = {
  role_id: string;
};

type CapabilityRow = {
  capability_code: string;
};

type RoleRow = {
  id: string;
  is_web_access: boolean | null;
};

type RoleAccessRow = Pick<RoleRow, "is_web_access">;

type CapabilityOverrideRow = {
  capability_code: string;
  effect: "allow" | "deny";
};

/**
 * Adapts Supabase tenant/auth tables to application session repository contract.
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
    readonly email: string;
    readonly status: "active" | "inactive";
    readonly tenantId: string;
  } | null> {
    const { data, error } = await this.client
      .from("user_profiles")
      .select("user_id, email, status, tenant_id")
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
      userId: data.user_id,
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
      data?.map((item: UserRoleRow) => item.role_id).filter((value) => !!value) ??
      [];

    return [...new Set(roles)];
  }

  async hasWebAccessRole(input: {
    tenantId: string;
    userId: string;
    roleIds?: readonly string[];
  }): Promise<boolean> {
    const explicitRoleIds = input.roleIds
      ? Array.from(new Set(input.roleIds)).filter((roleId) => roleId.trim().length > 0)
      : null;

    if (explicitRoleIds && explicitRoleIds.length === 0) {
      return false;
    }

    const roleIds = explicitRoleIds ??
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
      .in("id", roleIds)
      .returns<RoleAccessRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).some((item) => item.is_web_access === true);
  }

  async listTenantRoleCapabilities(input: {
    tenantId: string;
    roleIds: readonly string[];
  }): Promise<readonly string[]> {
    const normalizedRoleIds = Array.from(new Set(input.roleIds)).filter(
      (roleId) => roleId.trim().length > 0
    );

    if (normalizedRoleIds.length === 0) {
      return [];
    }

    const [capabilityResult, roleResult] = await Promise.all([
      this.client
        .from("role_capabilities")
        .select("capability_code")
        .eq("tenant_id", input.tenantId)
        .in("role_id", normalizedRoleIds)
        .then((result) =>
          this.ensureRows<CapabilityRow>(
            result,
            "Role capability lookup failed"
          )
        ),
      this.client
        .from("roles")
        .select("id, is_web_access")
        .eq("tenant_id", input.tenantId)
        .in("id", normalizedRoleIds)
        .then((result) =>
          this.ensureRows<RoleRow>(result, "Role lookup for web access failed")
        ),
    ]);

    const capabilities = new Set(capabilityResult.map((row) => row.capability_code));

    const hasWebRole = roleResult.some((row) => row.is_web_access === true);
    if (hasWebRole) {
      capabilities.add(WEB_ACCESS_CAPABILITY);
    }

    return [...capabilities];
  }

  async listUserCapabilityOverrides(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly UserCapabilityOverride[]> {
    const { data, error } = await this.client
      .from("user_capability_overrides")
      .select("capability_code, effect")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId)
      .returns<CapabilityOverrideRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((item) => ({
      capabilityCode: item.capability_code,
      effect: item.effect,
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
