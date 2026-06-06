import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseUserManagementRepository } from "./SupabaseUserManagementRepository";

interface QueryCall {
  readonly operation: string;
  readonly details: string;
}

function createMockQuery<T>(
  response: {
    data: T;
    error: null;
    count?: number;
  },
  calls: QueryCall[]
): {
  readonly select: (
    columns: string,
    options?: {
      count?: "exact" | "planned" | "estimated";
      head?: boolean;
    }
  ) => unknown;
  readonly eq: (column: string, value: unknown) => unknown;
  readonly insert: (_values: unknown) => unknown;
  readonly single: () => Promise<{ readonly data: T; readonly error: null }>;
  readonly data: T;
  readonly error: null;
  readonly count?: number;
} {
  const query = {
    data: response.data,
    error: response.error,
    count: response.count,
    select: (
      _columns: string,
      _options?: {
        readonly count?: "exact" | "planned" | "estimated";
        readonly head?: boolean;
      }
    ) => {
      calls.push({
        operation: "select",
        details: `${_columns}${_options ? `:${JSON.stringify(_options)}` : ""}`,
      });

      return query;
    },
    eq: (column: string, value: unknown) => {
      calls.push({
        operation: "eq",
        details: `${column}=${String(value)}`,
      });

      return query;
    },
    insert: (_values: unknown) => {
      calls.push({
        operation: "insert",
        details: "inserted",
      });

      return {
        ...query,
        select: () => query,
        single: async () => ({
          data: response.data,
          error: response.error,
        }),
      };
    },
    single: async () => ({
      data: response.data,
      error: response.error,
    }),
  };

  return {
    ...query,
  };
}

async function runUserManagementRepositoryTenantActiveFilterCheck(): Promise<void> {
  const calls: QueryCall[] = [];

  const activeUsersByTenant = [
    {
      user_id: "user-id-1",
      tenant_id: "tenant-1",
      email: "tenant-1-user@example.com",
      full_name: "Tenant One",
      phone: null,
      status: "active" as const,
    },
  ];

  const client = {
    from: (table: string) => {
      if (table !== "user_profiles") {
        throw new Error(`Unexpected table call: ${table}`);
      }

      return createMockQuery(
        {
          data: activeUsersByTenant,
          error: null,
        },
        calls
      );
    },
  } as unknown as SupabaseClient;

  const repository = new SupabaseUserManagementRepository(client);

  const result = await repository.listActiveUsers({
    tenantId: "tenant-1",
  });

  expect(result).toHaveLength(1);

  const resultSummary = result[0];

  expect(resultSummary.tenant_id).toBe("tenant-1");

  expect(resultSummary.status).toBe("active");

  const selectCall = calls.find((entry) => entry.operation === "select");
  expect(selectCall).toBeDefined();
  expect(selectCall?.details).toContain(
    "user_id,tenant_id,email,full_name,phone,status"
  );

  const tenantFilter = calls.find(
    (entry) =>
      entry.operation === "eq" && entry.details.startsWith("tenant_id=")
  );
  expect(tenantFilter).toBeDefined();
  expect(tenantFilter?.details).toBe("tenant_id=tenant-1");

  const statusFilter = calls.find(
    (entry) => entry.operation === "eq" && entry.details.startsWith("status=")
  );
  expect(statusFilter).toBeDefined();
  expect(statusFilter?.details).toBe("status=active");
}

async function runUserManagementRepositoryAuditFallbackCheck(): Promise<void> {
  const calls: QueryCall[] = [];
  const tenantLookupResult = {
    tenant_id: "tenant-1",
  };

  const auditInsertAttempts: string[] = [];

  const client = {
    from: (table: string) => {
      calls.push({
        operation: "from",
        details: table,
      });

      if (table === "user_profiles") {
        const query = {
          tenant_id: tenantLookupResult.tenant_id,
        };

        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: query,
                error: null,
              }),
            }),
          }),
        } as unknown as {
          readonly select: () => {
            readonly eq: () => {
              readonly single: () => Promise<{
                readonly data: { tenant_id: string } | null;
                readonly error: null;
              }>;
            };
          };
        };
      }

      if (table !== "audit_log") {
        throw new Error(`Unexpected table call: ${table}`);
      }

      const attempts = attemptsByTable.get("audit_log") || 0;
      attemptsByTable.set("audit_log", attempts + 1);
      auditInsertAttempts.push(`attempt-${attempts + 1}`);

      return {
        insert: (_candidate: Record<string, unknown>) => {
          calls.push({
            operation: "insert",
            details: `audit-log:${attempts + 1}`,
          });

          if (attempts < 2) {
            return {
              error: {
                message: `audit constraint failed ${attempts + 1}`,
                details: "constraint violation",
                hint: null,
                code: "23502",
              },
            };
          }

          return {
            error: null,
          };
        },
      } as unknown as {
        readonly insert: (_candidate: Record<string, unknown>) => {
          readonly error: {
            readonly message: string;
            readonly details: string;
            readonly hint: null;
            readonly code: string;
          } | null;
        };
      };
    },
  } as unknown as SupabaseClient;

  const attemptsByTable = new Map<string, number>();

  const repository = new SupabaseUserManagementRepository(client);

  await repository.recordUserCreatedAudit({
    actorUserId: "actor-1",
    targetUserId: "user-id-1",
  });

  const insertCalls = calls.filter((entry) => entry.operation === "insert");

  expect(insertCalls).toHaveLength(3);

  const fallbackOrder = insertCalls.map((entry) => entry.details);
  expect(fallbackOrder).toEqual(["audit-log:1", "audit-log:2", "audit-log:3"]);

  expect(auditInsertAttempts).toHaveLength(3);

  const tenantQueryCalls = calls.filter(
    (entry) => entry.operation === "from" && entry.details === "user_profiles"
  );
  expect(tenantQueryCalls).toHaveLength(1);
}

describe("SupabaseUserManagementRepository", () => {
  it("lists only active users for the requested tenant", async () => {
    await runUserManagementRepositoryTenantActiveFilterCheck();
  });

  it("retries audit payload variants when inserts fail", async () => {
    await runUserManagementRepositoryAuditFallbackCheck();
  });
});
