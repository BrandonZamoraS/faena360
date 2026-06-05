import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAppSessionRepository } from "./SupabaseAppSessionRepository";

type QueryResult = { data: unknown; error: { message: string } | null };

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  returns: ReturnType<typeof vi.fn>;
  then: (onFulfilled: any, onRejected?: any) => Promise<unknown>;
};

function createQueryBuilder(result: QueryResult): QueryBuilder {
  const query: Partial<QueryBuilder> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };

  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.returns = vi.fn().mockResolvedValue(result);
  query.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);

  return query as QueryBuilder;
}

function createClientFromPlan(plan: {
  tenants?: QueryBuilder[];
  user_profiles?: QueryBuilder[];
  user_roles?: QueryBuilder[];
  role_capabilities?: QueryBuilder[];
  capabilities?: QueryBuilder[];
  roles?: QueryBuilder[];
  user_capability_overrides?: QueryBuilder[];
}): SupabaseClient {
  const queues = {
    tenants: [...(plan.tenants ?? [])],
    user_profiles: [...(plan.user_profiles ?? [])],
    user_roles: [...(plan.user_roles ?? [])],
    role_capabilities: [...(plan.role_capabilities ?? [])],
    capabilities: [...(plan.capabilities ?? [])],
    roles: [...(plan.roles ?? [])],
    user_capability_overrides: [...(plan.user_capability_overrides ?? [])],
  };

  return {
    from: vi.fn((table: keyof typeof queues) => {
      const bucket = queues[table];
      if (!bucket || bucket.length === 0) {
        throw new Error(`Unexpected query for table ${table}`);
      }

      return bucket.shift() as QueryBuilder;
    }),
  } as unknown as SupabaseClient;
}

describe("SupabaseAppSessionRepository", () => {
  it("getTenant: returns tenant row when present", async () => {
    const tenantQuery = createQueryBuilder({
      data: { id: "tenant-001", status: "active" },
      error: null,
    });

    const client = createClientFromPlan({
      tenants: [tenantQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.getTenant({ tenantId: "tenant-001" })
    ).resolves.toEqual({ id: "tenant-001", status: "active" });

    expect(tenantQuery.select).toHaveBeenCalledWith("id, status");
    expect(tenantQuery.eq).toHaveBeenNthCalledWith(1, "id", "tenant-001");
    expect(tenantQuery.maybeSingle).toHaveBeenCalledOnce();
  });

  it("getTenant: throws when tenant not found", async () => {
    const tenantQuery = createQueryBuilder({
      data: null,
      error: { message: "tenant missing" },
    });

    const client = createClientFromPlan({
      tenants: [tenantQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.getTenant({ tenantId: "tenant-missing" })
    ).rejects.toThrow("tenant missing");
  });

  it("getUserProfile: maps row and returns null when missing", async () => {
    const existingQuery = createQueryBuilder({
      data: {
        id: "user-001",
        email: "alice@example.com",
        status: "active",
        tenant_id: "tenant-001",
      },
      error: null,
    });

    const missingQuery = createQueryBuilder({
      data: null,
      error: null,
    });

    const client = createClientFromPlan({
      user_profiles: [existingQuery, missingQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.getUserProfile({
        tenantId: "tenant-001",
        authUserId: "auth-001",
      })
    ).resolves.toEqual({
      userId: "user-001",
      email: "alice@example.com",
      status: "active",
      tenantId: "tenant-001",
    });

    await expect(
      repository.getUserProfile({
        tenantId: "tenant-001",
        authUserId: "auth-404",
      })
    ).resolves.toBeNull();
  });

  it("getUserProfile: throws on query error", async () => {
    const query = createQueryBuilder({
      data: null,
      error: { message: "query failed" },
    });

    const client = createClientFromPlan({
      user_profiles: [query],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.getUserProfile({
        tenantId: "tenant-001",
        authUserId: "auth-001",
      })
    ).rejects.toThrow("query failed");
  });

  it("listUserRoles: deduplicates role ids", async () => {
    const query = createQueryBuilder({
      data: [
        { role_id: "r-admin" },
        { role_id: "r-reader" },
        { role_id: "r-admin" },
      ],
      error: null,
    });

    const client = createClientFromPlan({
      user_roles: [query],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.listUserRoles({ tenantId: "tenant-001", userId: "user-001" })
    ).resolves.toEqual(["r-admin", "r-reader"]);
  });

  it("listTenantRoleCapabilities: loads role capabilities and web access marker", async () => {
    const capabilityQuery = createQueryBuilder({
      data: [
        { role_id: "r-admin", capability_id: "cap-read" },
        { role_id: "r-reader", capability_id: "cap-write" },
        { role_id: "r-admin", capability_id: "cap-read" },
      ],
      error: null,
    });

    const capabilityKeyQuery = createQueryBuilder({
      data: [
        { id: "cap-read", key: "orders.read" },
        { id: "cap-write", key: "orders.write" },
      ],
      error: null,
    });

    const roleQuery = createQueryBuilder({
      data: [
        { id: "r-admin", tenant_id: "tenant-001", is_web_access: true },
        { id: "r-reader", is_web_access: false },
      ],
      error: null,
    });

    const client = createClientFromPlan({
      role_capabilities: [capabilityQuery],
      capabilities: [capabilityKeyQuery],
      roles: [roleQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    const capabilities = await repository.listTenantRoleCapabilities({
      tenantId: "tenant-001",
      roleIds: ["r-admin", "r-reader", "  ", "r-admin", "r-unauthorized"],
    });

    expect(capabilityQuery.in).toHaveBeenCalledWith("role_id", [
      "r-admin",
      "r-reader",
      "r-unauthorized",
    ]);
    expect(roleQuery.in).toHaveBeenCalledWith("id", [
      "r-admin",
      "r-reader",
      "r-unauthorized",
    ]);
    expect(capabilityKeyQuery.in).toHaveBeenCalledWith("id", [
      "cap-read",
      "cap-write",
    ]);
    expect(capabilities).toEqual(
      expect.arrayContaining([
        "orders.read",
        "orders.write",
        "web.portal.access",
      ])
    );
  });

  it("listTenantRoleCapabilities: ignores role_capabilities for roles outside tenant", async () => {
    const capabilityQuery = createQueryBuilder({
      data: [
        { role_id: "r-admin", capability_id: "cap-admin-read" },
        { role_id: "r-other", capability_id: "cap-other-read" },
      ],
      error: null,
    });

    const capabilityKeyQuery = createQueryBuilder({
      data: [{ id: "cap-admin-read", key: "admin.read" }],
      error: null,
    });

    const roleQuery = createQueryBuilder({
      data: [{ id: "r-admin", tenant_id: "tenant-001", is_web_access: true }],
      error: null,
    });

    const client = createClientFromPlan({
      role_capabilities: [capabilityQuery],
      roles: [roleQuery],
      capabilities: [capabilityKeyQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    const capabilities = await repository.listTenantRoleCapabilities({
      tenantId: "tenant-001",
      roleIds: ["r-admin", "r-other"],
    });

    expect(capabilityKeyQuery.in).toHaveBeenCalledWith("id", [
      "cap-admin-read",
    ]);
    expect(capabilities).toEqual(
      expect.arrayContaining(["admin.read", "web.portal.access"])
    );
  });

  it("listTenantRoleCapabilities: returns empty list when roleIds are blank", async () => {
    const client = createClientFromPlan({});
    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.listTenantRoleCapabilities({
        tenantId: "tenant-001",
        roleIds: ["", "  "],
      })
    ).resolves.toEqual([]);
  });

  it("hasWebAccessRole: returns true when a role grants web access", async () => {
    const roleQuery = createQueryBuilder({
      data: [{ is_web_access: false }, { is_web_access: true }],
      error: null,
    });

    const client = createClientFromPlan({
      roles: [roleQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.hasWebAccessRole({
        tenantId: "tenant-001",
        userId: "user-001",
        roleIds: ["r-admin", "r-reader"],
      })
    ).resolves.toBe(true);

    expect(roleQuery.in).toHaveBeenCalledWith("id", ["r-admin", "r-reader"]);
  });

  it("hasWebAccessRole: returns false when roleIds are empty", async () => {
    const client = createClientFromPlan({
      roles: [],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.hasWebAccessRole({
        tenantId: "tenant-001",
        userId: "user-001",
        roleIds: [],
      })
    ).resolves.toBe(false);
  });

  it("listUserCapabilityOverrides: maps snake_case rows to override interface", async () => {
    const query = createQueryBuilder({
      data: [
        { capability_id: "cap-a", grant_type: "allow" },
        { capability_id: "cap-b", grant_type: "deny" },
      ],
      error: null,
    });

    const capabilityQuery = createQueryBuilder({
      data: [
        { id: "cap-a", key: "feature.a" },
        { id: "cap-b", key: "feature.b" },
      ],
      error: null,
    });

    const client = createClientFromPlan({
      user_capability_overrides: [query],
      capabilities: [capabilityQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.listUserCapabilityOverrides({
        tenantId: "tenant-001",
        userId: "user-001",
      })
    ).resolves.toEqual([
      { capabilityCode: "feature.a", effect: "allow" },
      { capabilityCode: "feature.b", effect: "deny" },
    ]);

    expect(capabilityQuery.in).toHaveBeenCalledWith("id", ["cap-a", "cap-b"]);
  });

  it("throws when role capability lookup fails", async () => {
    const capabilityQuery = createQueryBuilder({
      data: null,
      error: { message: "capability lookup failed" },
    });

    const roleQuery = createQueryBuilder({
      data: [{ id: "r-admin", is_web_access: true }],
      error: null,
    });

    const client = createClientFromPlan({
      role_capabilities: [capabilityQuery],
      roles: [roleQuery],
    });

    const repository = new SupabaseAppSessionRepository(client);

    await expect(
      repository.listTenantRoleCapabilities({
        tenantId: "tenant-001",
        roleIds: ["r-admin"],
      })
    ).rejects.toThrow("capability lookup failed");
  });
});
