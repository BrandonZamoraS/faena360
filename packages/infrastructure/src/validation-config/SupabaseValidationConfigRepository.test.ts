import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseValidationConfigRepository } from "./SupabaseValidationConfigRepository";

type MaybeSingleResponse<T> = {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
};

type RowsResponse<T> = {
  readonly data: T[] | null;
  readonly error: { readonly message: string } | null;
};

function createMaybeSingleQuery<T>(
  response: MaybeSingleResponse<T>,
  calls: string[]
) {
  return {
    data: response.data,
    error: response.error,
    eq: (column: string, value: unknown) => {
      calls.push(`${column}=${String(value)}`);
      return createMaybeSingleQuery(response, calls);
    },
    maybeSingle: async () => response,
  };
}

function createRowsQuery<T>(response: RowsResponse<T>, calls: string[]) {
  return {
    data: response.data,
    error: response.error,
    eq: (column: string, value: unknown) => {
      calls.push(`${column}=${String(value)}`);
      return createRowsQuery(response, calls);
    },
    in: (column: string, values: readonly unknown[]) => {
      calls.push(`${column} in (${values.join(",")})`);
      return createRowsQuery(response, calls);
    },
  };
}

describe("SupabaseValidationConfigRepository", () => {
  it("loads tenant validation config rows with explicit tenant and tipo filters", async () => {
    const calls: string[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("tenant_validation_configs");
        return {
          select: () =>
            createMaybeSingleQuery(
              { data: { config: {} }, error: null },
              calls
            ),
        };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseValidationConfigRepository(client);

    await expect(
      repository.getTenantOverride({ tenantId: "tenant-1", tipo: "gasto" })
    ).resolves.toEqual({});
    expect(calls).toEqual(["tenant_id=tenant-1", "tipo=gasto"]);
  });

  it("verifies tenant and user context within the same tenant", async () => {
    const tenantCalls: string[] = [];
    const userCalls: string[] = [];
    const client = {
      from: (table: string) => {
        if (table === "tenants") {
          return {
            select: () =>
              createMaybeSingleQuery(
                { data: { id: "tenant-1", status: "active" }, error: null },
                tenantCalls
              ),
          };
        }

        expect(table).toBe("user_profiles");
        return {
          select: () =>
            createMaybeSingleQuery(
              {
                data: {
                  id: "user-1",
                  tenant_id: "tenant-1",
                  status: "active",
                },
                error: null,
              },
              userCalls
            ),
        };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseValidationConfigRepository(client);
    const result = await repository.getTenantUserContext({
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(result).toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      tenantStatus: "active",
      userStatus: "active",
    });
    expect(tenantCalls).toEqual(["id=tenant-1"]);
    expect(userCalls).toEqual(["tenant_id=tenant-1", "id=user-1"]);
  });

  it("keeps capability lookup tenant-scoped even with shared role ids", async () => {
    const roleCapabilityCalls: string[] = [];
    const roleCalls: string[] = [];
    const capabilityCalls: string[] = [];
    const client = {
      from: (table: string) => {
        if (table === "role_capabilities") {
          return {
            select: () =>
              createRowsQuery(
                {
                  data: [
                    { role_id: "role-1", capability_id: "cap-1" },
                    { role_id: "role-2", capability_id: "cap-2" },
                  ],
                  error: null,
                },
                roleCapabilityCalls
              ),
          };
        }

        if (table === "roles") {
          return {
            select: () =>
              createRowsQuery(
                {
                  data: [{ id: "role-1", tenant_id: "tenant-1" }],
                  error: null,
                },
                roleCalls
              ),
          };
        }

        expect(table).toBe("capabilities");
        return {
          select: () =>
            createRowsQuery(
              {
                data: [{ id: "cap-1", key: "whatsapp.channel.access" }],
                error: null,
              },
              capabilityCalls
            ),
        };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseValidationConfigRepository(client);
    const capabilities = await repository.listCapabilitiesForRoles({
      tenantId: "tenant-1",
      roleIds: ["role-1", "role-2"],
    });

    expect(capabilities).toEqual(["whatsapp.channel.access"]);
    expect(roleCapabilityCalls).toContain("role_id in (role-1,role-2)");
    expect(roleCalls).toEqual(["tenant_id=tenant-1", "id in (role-1,role-2)"]);
    expect(capabilityCalls).toEqual(["id in (cap-1)"]);
  });
});
