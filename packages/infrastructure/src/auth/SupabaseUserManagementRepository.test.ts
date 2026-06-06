import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseUserManagementRepository } from "./SupabaseUserManagementRepository";

interface QueryCall {
  readonly operation: string;
  readonly details: string;
}

function createMockQuery<T>(response: {
  data: T;
  error: null;
  count?: number;
}, calls: QueryCall[]): {
  readonly select: (columns: string, options?: {
    count?: "exact" | "planned" | "estimated";
    head?: boolean;
  }) => unknown;
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
  };

  return {
    select: (columns: string, options?: {
      readonly count?: "exact" | "planned" | "estimated";
      readonly head?: boolean;
    }): unknown => {
      calls.push({
        operation: "select",
        details: `${columns}${options ? `:${JSON.stringify(options)}` : ""}`,
      });

      return query;
    },
    eq: (column: string, value: unknown): unknown => {
      calls.push({
        operation: "eq",
        details: `${column}=${String(value)}`,
      });

      return query;
    },
    insert: (_values: unknown): unknown => {
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
    data: response.data,
    error: response.error,
    count: response.count,
  };
}

export async function runUserManagementRepositoryTenantActiveFilterCheck(): Promise<void> {
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

  if (result.length !== 1) {
    throw new Error("Expected one active tenant user.");
  }

  const resultSummary = result[0];

  if (resultSummary.tenant_id !== "tenant-1") {
    throw new Error("Expected listed users to stay on requested tenant scope.");
  }

  if (resultSummary.status !== "active") {
    throw new Error("Expected listed users to be active-only.");
  }

  const selectCall = calls.find((entry) => entry.operation === "select");
  if (
    !selectCall ||
    !selectCall.details.includes("user_id,tenant_id,email,full_name,phone,status")
  ) {
    throw new Error("Expected listActiveUsers to read tenant and profile summary columns.");
  }

  const tenantFilter = calls.find(
    (entry) => entry.operation === "eq" && entry.details.startsWith("tenant_id=")
  );
  if (!tenantFilter || tenantFilter.details !== "tenant_id=tenant-1") {
    throw new Error("Expected active listing to filter by tenant_id.");
  }

  const statusFilter = calls.find(
    (entry) => entry.operation === "eq" && entry.details.startsWith("status=")
  );
  if (!statusFilter || statusFilter.details !== "status=active") {
    throw new Error("Expected active listing to filter by status=active.");
  }
}

export async function runUserManagementRepositoryAuditFallbackCheck(): Promise<void> {
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
              readonly single: () => Promise<{ readonly data: { tenant_id: string } | null; readonly error: null }>;
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
      } as unknown as { readonly insert: (_candidate: Record<string, unknown>) => { readonly error: { readonly message: string; readonly details: string; readonly hint: null; readonly code: string } | null } };
    },
  } as unknown as SupabaseClient;

  const attemptsByTable = new Map<string, number>();

  const repository = new SupabaseUserManagementRepository(client);

  await repository.recordUserCreatedAudit({
    actorUserId: "actor-1",
    targetUserId: "user-id-1",
  });

  const insertCalls = calls.filter((entry) => entry.operation === "insert");

  if (insertCalls.length !== 3) {
    throw new Error("Expected audit insert fallback to try multiple candidate payloads.");
  }

  const fallbackOrder = insertCalls.map((entry) => entry.details);
  if (fallbackOrder[0] !== "audit-log:1" || fallbackOrder[1] !== "audit-log:2" || fallbackOrder[2] !== "audit-log:3") {
    throw new Error("Expected audit fallback to attempt three payload variants in order.");
  }

  if (auditInsertAttempts.length !== 3) {
    throw new Error("Expected three insert attempts while exercising fallback behavior.");
  }

  const tenantQueryCalls = calls.filter((entry) => entry.operation === "from" && entry.details === "user_profiles");
  if (tenantQueryCalls.length !== 1) {
    throw new Error("Expected user profile lookup before audit insert fallback.");
  }
}
