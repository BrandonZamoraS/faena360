import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseUserManagementRepository } from "./SupabaseUserManagementRepository";

interface QueryCall {
  readonly operation: string;
  readonly details: string;
}

interface MockInsertResponse {
  readonly data: unknown;
  readonly error: null;
  readonly count?: number;
}

function createMockQuery<T>(
  response: MockInsertResponse & { readonly data: T },
  calls: QueryCall[],
  table: string,
  onInsert?: (values: unknown) => void
) {
  const query = {
    data: response.data,
    error: response.error,
    count: response.count,
    select: (_columns: string, _options?: unknown) => {
      calls.push({ operation: "select", details: `${table}:${_columns}` });
      return query;
    },
    eq: (column: string, value: unknown) => {
      calls.push({
        operation: "eq",
        details: `${table}:${column}=${String(value)}`,
      });
      return query;
    },
    in: (column: string, values: readonly unknown[]) => {
      calls.push({
        operation: "in",
        details: `${table}:${column}=${values.join(",")}`,
      });
      return query;
    },
    delete: () => {
      calls.push({ operation: "delete", details: table });
      return query;
    },
    update: (values: unknown) => {
      calls.push({
        operation: "update",
        details: `${table}:${JSON.stringify(values)}`,
      });
      return query;
    },
    insert: (values: unknown) => {
      calls.push({ operation: "insert", details: table });
      onInsert?.(values);
      return {
        ...query,
        select: () => ({
          single: async () => ({
            data: response.data,
            error: response.error,
          }),
        }),
        error: null,
      };
    },
    single: async () => ({
      data: response.data,
      error: response.error,
    }),
  };

  return query;
}

async function runUpdateProfileScopesByTenantAndUser(): Promise<void> {
  const calls: QueryCall[] = [];

  const client = {
    from: (table: string) => {
      expect(table).toBe("user_profiles");
      return createMockQuery({ data: null, error: null }, calls, table);
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);
  await repository.updateProfile({
    tenantId: "tenant-1",
    userId: "user-id-1",
    fullName: "Updated User",
    phone: "15552223333",
  });

  expect(calls).toContainEqual({
    operation: "update",
    details: 'user_profiles:{"full_name":"Updated User","phone":"15552223333"}',
  });
  expect(calls).toContainEqual({
    operation: "eq",
    details: "user_profiles:tenant_id=tenant-1",
  });
  expect(calls).toContainEqual({
    operation: "eq",
    details: "user_profiles:id=user-id-1",
  });
}

async function runReplaceRolesDeletesThenInsertsTenantScopedRoles(): Promise<void> {
  const calls: QueryCall[] = [];
  const insertPayloads: unknown[] = [];

  const client = {
    from: (table: string) => {
      if (table === "roles") {
        return createMockQuery(
          { data: [{ id: "role-a" }, { id: "role-b" }], error: null },
          calls,
          table
        );
      }

      expect(table).toBe("user_roles");
      return createMockQuery(
        { data: null, error: null },
        calls,
        table,
        (values) => insertPayloads.push(values)
      );
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);
  await repository.replaceRoles({
    tenantId: "tenant-1",
    userId: "user-id-1",
    roleIds: ["role-a", "role-b", "role-a"],
  });

  expect(calls).toContainEqual({ operation: "delete", details: "user_roles" });
  expect(insertPayloads[0]).toEqual([
    { tenant_id: "tenant-1", user_id: "user-id-1", role_id: "role-a" },
    { tenant_id: "tenant-1", user_id: "user-id-1", role_id: "role-b" },
  ]);
}

async function runReplaceRolesValidatesBeforeDeletingCurrentRoles(): Promise<void> {
  const calls: QueryCall[] = [];

  const client = {
    from: (table: string) => {
      if (table === "roles") {
        return createMockQuery(
          { data: [{ id: "role-a" }], error: null },
          calls,
          table
        );
      }

      if (table === "user_roles") {
        return createMockQuery({ data: null, error: null }, calls, table);
      }

      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);

  await expect(
    repository.replaceRoles({
      tenantId: "tenant-1",
      userId: "user-id-1",
      roleIds: ["role-a", "missing-role"],
    })
  ).rejects.toThrow("Role assignment includes roles outside the tenant");

  expect(calls).not.toContainEqual({
    operation: "delete",
    details: "user_roles",
  });
}

async function runDeactivateProfileUsesStatusInactive(): Promise<void> {
  const calls: QueryCall[] = [];

  const client = {
    from: (table: string) => {
      expect(table).toBe("user_profiles");
      return createMockQuery(
        { data: { auth_user_id: "auth-user-id-1" }, error: null },
        calls,
        table
      );
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);
  const result = await repository.deactivateProfile({
    tenantId: "tenant-1",
    userId: "user-id-1",
  });

  expect(calls).toContainEqual({
    operation: "update",
    details: 'user_profiles:{"status":"inactive"}',
  });
  expect(calls).not.toContainEqual({
    operation: "delete",
    details: "user_profiles",
  });
  expect(result.authUserId).toBe("auth-user-id-1");
}

async function runTenantActiveUsersUseSchemaColumnsCheck(): Promise<void> {
  const calls: QueryCall[] = [];

  const activeUsers = [
    {
      id: "user-id-1",
      tenant_id: "tenant-1",
      email: "tenant-1-user@example.com",
      full_name: "Tenant One",
      phone: null,
      status: "active" as const,
    },
  ];

  const client = {
    from: (table: string) => {
      expect(table).toBe("user_profiles");
      return createMockQuery({ data: activeUsers, error: null }, calls, table);
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);
  const result = await repository.listActiveUsers({ tenantId: "tenant-1" });

  expect(result).toHaveLength(1);
  expect(result[0]?.user_id).toBe("user-id-1");
  expect(
    calls.find((entry) => entry.operation === "select")?.details
  ).toContain("id,tenant_id,email,full_name,phone,status");
}

async function runCreateProfileUsesAuthUserColumnAndReturnsId(): Promise<void> {
  const calls: QueryCall[] = [];
  let insertPayload: unknown;

  const client = {
    from: (table: string) => {
      expect(table).toBe("user_profiles");
      return createMockQuery(
        { data: { id: "local-user-id-1" }, error: null },
        calls,
        table,
        (values) => {
          insertPayload = values;
        }
      );
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);
  const userId = await repository.createProfile({
    tenantId: "tenant-1",
    authUserId: "auth-user-id-1",
    email: "user@example.com",
    fullName: "Tenant user",
    phone: "+1 555 123 456",
  });

  expect(userId).toBe("local-user-id-1");
  expect(insertPayload).toMatchObject({
    tenant_id: "tenant-1",
    auth_user_id: "auth-user-id-1",
    email: "user@example.com",
    full_name: "Tenant user",
    phone: "+1 555 123 456",
    status: "active",
  });
}

async function runAssignRolesDeduplicatesRoleIdsBeforeInsert(): Promise<void> {
  const calls: QueryCall[] = [];
  let insertPayload: unknown;

  const client = {
    from: (table: string) => {
      expect(table).toBe("user_roles");
      return createMockQuery(
        { data: null, error: null },
        calls,
        table,
        (values) => {
          insertPayload = values;
        }
      );
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);
  await repository.assignRoles({
    tenantId: "tenant-1",
    userId: "user-id-1",
    roleIds: ["role-a", "role-b", "role-a", "role-c", "role-b"],
  });

  expect(insertPayload).toEqual([
    { tenant_id: "tenant-1", user_id: "user-id-1", role_id: "role-a" },
    { tenant_id: "tenant-1", user_id: "user-id-1", role_id: "role-b" },
    { tenant_id: "tenant-1", user_id: "user-id-1", role_id: "role-c" },
  ]);
}

async function runIdentifierExistsNormalizesInputBeforeLookup(): Promise<void> {
  const calls: QueryCall[] = [];

  const client = {
    rpc: (functionName: string, args: Record<string, unknown>) => {
      calls.push({ operation: "rpc", details: functionName });
      calls.push({
        operation: "rpc_args",
        details: `${String(args.lookup_email)}:${String(args.lookup_phone)}`,
      });

      return {
        data: true,
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);

  const exists = await repository.identifierExists({
    email: "  ADMIN@EXAMPLE.COM  ",
    phone: "+1 (555) 111-2222",
  });

  expect(exists).toBe(true);
  expect(calls).toContainEqual({
    operation: "rpc",
    details: "user_profile_identifier_exists",
  });
  expect(calls).toContainEqual({
    operation: "rpc_args",
    details: "admin@example.com:15551112222",
  });
}

async function runRecordUserCreatedAuditUsesCurrentSchema(): Promise<void> {
  const calls: QueryCall[] = [];
  let insertedAuditPayload: unknown;

  const client = {
    from: (table: string) => {
      calls.push({ operation: "from", details: table });

      if (table === "user_profiles") {
        return {
          select: (_columns: string) => {
            calls.push({ operation: "select", details: `${_columns}` });
            return {
              eq: (_column: string, _value: unknown) => {
                calls.push({
                  operation: "eq",
                  details: `${_column}=${String(_value)}`,
                });
                return {
                  single: async () => ({
                    data: { tenant_id: "tenant-1" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table !== "audit_log") {
        throw new Error(`Unexpected table call: ${table}`);
      }

      return {
        insert: (payload: unknown) => {
          insertedAuditPayload = payload;
          calls.push({ operation: "insert", details: "audit_log" });
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);

  await repository.recordUserCreatedAudit({
    actorUserId: "actor-1",
    targetUserId: "user-id-1",
  });

  expect(calls).toContainEqual({ operation: "from", details: "user_profiles" });
  expect(calls).toContainEqual({ operation: "from", details: "audit_log" });
  expect(insertedAuditPayload).toMatchObject({
    tenant_id: "tenant-1",
    actor_user_id: "actor-1",
    target_user_id: "user-id-1",
    action: "user_created",
  });
  expect(
    (insertedAuditPayload as { occurred_at?: string })?.occurred_at
  ).toBeTypeOf("string");
}

describe("SupabaseUserManagementRepository", () => {
  it("maps active list results to TenantUserSummary.user_id from user_profiles.id", async () => {
    await runTenantActiveUsersUseSchemaColumnsCheck();
  });

  it("creates profile with auth_user_id and returns local profile id", async () => {
    await runCreateProfileUsesAuthUserColumnAndReturnsId();
  });

  it("deduplicates role ids before assigning roles", async () => {
    await runAssignRolesDeduplicatesRoleIdsBeforeInsert();
  });

  it("normalizes identifiers before existence checks", async () => {
    await runIdentifierExistsNormalizesInputBeforeLookup();
  });

  it("writes audit log using canonical column names", async () => {
    await runRecordUserCreatedAuditUsesCurrentSchema();
  });

  it("updates profiles scoped by tenant and user", async () => {
    await runUpdateProfileScopesByTenantAndUser();
  });

  it("replaces user roles with tenant-scoped assignments", async () => {
    await runReplaceRolesDeletesThenInsertsTenantScopedRoles();
  });

  it("validates replacement roles before deleting current roles", async () => {
    await runReplaceRolesValidatesBeforeDeletingCurrentRoles();
  });

  it("soft deletes profiles by setting status inactive", async () => {
    await runDeactivateProfileUsesStatusInactive();
  });
});
