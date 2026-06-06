import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type {
  TenantUserSummary,
  UserManagementRepository,
} from "@faena360/domain";

interface SupabaseProfileRow {
  readonly user_id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly phone: string | null;
  readonly status: "active" | "inactive";
}

interface AuditCandidate {
  readonly [key: string]: unknown;
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
  private readonly client: SupabaseClient;

  public constructor(client: SupabaseClient) {
    this.client = client;
  }

  public async identifierExists(input: {
    readonly email: string;
    readonly phone?: string;
  }): Promise<boolean> {
    if (
      await existsByField(this.client, "user_profiles", "email", input.email)
    ) {
      return true;
    }

    if (!input.phone) {
      return false;
    }

    return existsByField(this.client, "user_profiles", "phone", input.phone);
  }

  public async createProfile(input: CreateProfileInput): Promise<string> {
    const profilePayload = {
      tenant_id: input.tenantId,
      user_id: input.authUserId,
      email: input.email,
      full_name: input.fullName,
      phone: input.phone ?? null,
      status: "active" as const,
    };

    const response = await this.client
      .from("user_profiles")
      .insert(profilePayload)
      .select("user_id")
      .single();

    const data = response.data as { user_id: string } | null;
    if (response.error) {
      throw new Error(formatSupabaseError(response.error));
    }

    if (!data?.user_id) {
      throw new Error("Profile creation did not return a user id.");
    }

    return data.user_id;
  }

  public async assignRoles(input: AssignRolesInput): Promise<void> {
    if (input.roleIds.length === 0) {
      return;
    }

    const roleRows = input.roleIds.map((roleId) => ({
      tenant_id: input.tenantId,
      user_id: input.userId,
      role_id: roleId,
    }));

    const response = await this.client.from("user_roles").insert(roleRows);

    if (response.error) {
      throw new Error(formatSupabaseError(response.error));
    }
  }

  public async listActiveUsers(input: {
    readonly tenantId: string;
  }): Promise<readonly TenantUserSummary[]> {
    const response = await this.client
      .from("user_profiles")
      .select("user_id,tenant_id,email,full_name,phone,status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active");

    if (response.error) {
      throw new Error(formatSupabaseError(response.error));
    }

    return (response.data as readonly SupabaseProfileRow[]).map((row) => ({
      ...row,
      phone: row.phone ?? null,
    }));
  }

  public async recordUserCreatedAudit(input: RecordAuditInput): Promise<void> {
    const targetTenantId = await this.resolveTenantIdForProfile(
      input.targetUserId
    );
    const createdAt = new Date().toISOString();

    const candidates: readonly AuditCandidate[] = [
      {
        event_name: "user_created",
        tenant_id: targetTenantId,
        actor_user_id: input.actorUserId,
        target_user_id: input.targetUserId,
        created_at: createdAt,
      },
      {
        action: "user_created",
        tenant_id: targetTenantId,
        actor_user_id: input.actorUserId,
        target_user_id: input.targetUserId,
        created_at: createdAt,
      },
      {
        actor_user_id: input.actorUserId,
        target_user_id: input.targetUserId,
        event_code: "user_created",
        created_at: createdAt,
      },
    ];

    await insertAuditRecordWithFallback(this.client, candidates);
  }

  private async resolveTenantIdForProfile(
    userId: string
  ): Promise<string | undefined> {
    const response = await this.client
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    if (response.error) {
      return undefined;
    }

    const data = response.data as { tenant_id?: string };
    return data?.tenant_id;
  }
}

async function existsByField(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<boolean> {
  const response = await client
    .from(table)
    .select("user_id", { count: "exact", head: true })
    .eq(column, value);

  if (response.error) {
    throw new Error(formatSupabaseError(response.error));
  }

  return (response.count ?? 0) > 0;
}

async function insertAuditRecordWithFallback(
  client: SupabaseClient,
  candidates: readonly AuditCandidate[]
): Promise<void> {
  let lastError: PostgrestError | null = null;

  for (const candidate of candidates) {
    const response = await client.from("audit_log").insert(candidate);

    if (!response.error) {
      return;
    }

    lastError = response.error;
  }

  if (lastError) {
    throw new Error(formatSupabaseError(lastError));
  }
}

function formatSupabaseError(error: PostgrestError | Error): string {
  return "message" in error
    ? error.message
    : "Supabase repository request failed.";
}
