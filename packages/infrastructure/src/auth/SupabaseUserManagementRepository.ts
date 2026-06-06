import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  TenantUserSummary,
  UserManagementRepository,
} from "@faena360/domain";

interface SupabaseProfileRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly phone: string | null;
  readonly status: "active" | "inactive";
}

interface CreateProfileInput {
  readonly tenantId: string;
  readonly authUserId: string;
  readonly email: string;
  readonly fullName: string;
  readonly phone?: string;
}

interface AssignRolesInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly roleIds: readonly string[];
}

interface RecordAuditInput {
  readonly actorUserId: string;
  readonly targetUserId: string;
}

export class SupabaseUserManagementRepository implements UserManagementRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async identifierExists(input: {
    readonly email: string;
    readonly phone?: string;
  }): Promise<boolean> {
    const normalizedEmail = normalizeIdentifierEmail(input.email);
    const normalizedPhone = input.phone
      ? normalizeIdentifierPhone(input.phone)
      : undefined;

    const response = await this.client.rpc("user_profile_identifier_exists", {
      lookup_email: normalizedEmail,
      lookup_phone: normalizedPhone ?? null,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (response.data === true) {
      return true;
    }

    return false;
  }

  public async createProfile(input: CreateProfileInput): Promise<string> {
    const profilePayload = {
      tenant_id: input.tenantId,
      auth_user_id: input.authUserId,
      email: input.email,
      full_name: input.fullName,
      phone: input.phone ?? null,
      status: "active" as const,
    };

    const response = await this.client
      .from("user_profiles")
      .insert(profilePayload)
      .select("id")
      .single();

    if (response.error) {
      throw new Error(response.error.message);
    }

    const data = response.data as { id: string } | null;

    if (!data?.id) {
      throw new Error("Profile creation did not return a local profile id.");
    }

    return data.id;
  }

  public async assignRoles(input: AssignRolesInput): Promise<void> {
    const uniqueRoleIds = Array.from(new Set(input.roleIds));

    if (uniqueRoleIds.length === 0) {
      return;
    }

    const roleRows = uniqueRoleIds.map((roleId) => ({
      tenant_id: input.tenantId,
      user_id: input.userId,
      role_id: roleId,
    }));

    const response = await this.client.from("user_roles").insert(roleRows);

    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  public async listActiveUsers(input: {
    readonly tenantId: string;
  }): Promise<readonly TenantUserSummary[]> {
    const response = await this.client
      .from("user_profiles")
      .select("id,tenant_id,email,full_name,phone,status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active");

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data as readonly SupabaseProfileRow[]).map((row) => ({
      user_id: row.id,
      tenant_id: row.tenant_id,
      email: row.email,
      full_name: row.full_name,
      phone: row.phone ?? null,
      status: row.status,
    }));
  }

  public async recordUserCreatedAudit(input: RecordAuditInput): Promise<void> {
    const response = await this.client.from("audit_log").insert({
      tenant_id: await this.resolveTenantIdForProfile(input.targetUserId),
      actor_user_id: input.actorUserId,
      target_user_id: input.targetUserId,
      action: "user_created",
      occurred_at: new Date().toISOString(),
    });

    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  private async resolveTenantIdForProfile(
    userId: string
  ): Promise<string | undefined> {
    const response = await this.client
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (response.error) {
      return undefined;
    }

    const data = response.data as { tenant_id?: string };
    return data?.tenant_id;
  }
}

function normalizeIdentifierEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeIdentifierPhone(value: string): string {
  const normalized = value.replace(/\D/g, "");

  return normalized.length > 0 ? normalized : value.trim();
}
