import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAuditRepository } from "./SupabaseAuditRepository";

// ---------------------------------------------------------------------------
// Mock factory — follows the existing pattern from SupabaseStorageAdapter.test.ts
// ---------------------------------------------------------------------------

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

function createMockSupabaseClient(): {
  client: SupabaseClient;
  queryBuilder: MockQueryBuilder;
} {
  const queryBuilder: MockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  const from = vi.fn().mockReturnValue(queryBuilder);

  const client = {
    from,
  } as unknown as SupabaseClient;

  return { client, queryBuilder };
}

// ---------------------------------------------------------------------------
// Helper: create a mock row matching the database snake_case shape
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant_id: "t1",
    actor_user_id: "aaaa-0000-aaaa-0000",
    target_user_id: "bbbb-1111-bbbb-1111",
    action: "user.update",
    source: "web",
    old_value: { display_name: "Old Name" },
    new_value: { display_name: "New Name", phone: "+5491112345678" },
    occurred_at: "2026-06-06T12:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SupabaseAuditRepository", () => {
  let repo: SupabaseAuditRepository;
  let client: SupabaseClient;
  let qb: MockQueryBuilder;

  beforeEach(() => {
    const mock = createMockSupabaseClient();
    client = mock.client;
    qb = mock.queryBuilder;
    repo = new SupabaseAuditRepository(client);
  });

  // ---- read() basic --------------------------------------------------------

  it("read: queries audit_log with tenantId filter", async () => {
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: [], error: null })
    );

    await repo.read({ tenantId: "t1" });

    expect(client.from).toHaveBeenCalledWith("audit_log");
    expect(qb.select).toHaveBeenCalledWith("*");
    expect(qb.eq).toHaveBeenCalledWith("tenant_id", "t1");
    expect(qb.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(qb.limit).toHaveBeenCalledWith(100);
  });

  // ---- read() with action filter -------------------------------------------

  it("read: applies action filter when provided", async () => {
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: [], error: null })
    );

    await repo.read({ tenantId: "t1", action: "user.update" });

    expect(qb.eq).toHaveBeenCalledWith("action", "user.update");
  });

  // ---- read() with custom limit --------------------------------------------

  it("read: applies custom limit when provided", async () => {
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: [], error: null })
    );

    await repo.read({ tenantId: "t1", limit: 10 });

    expect(qb.limit).toHaveBeenCalledWith(10);
  });

  // ---- read() — snake_case to camelCase mapping ----------------------------

  it("read: maps snake_case rows to camelCase AuditEntry", async () => {
    const mockRow = makeRow();
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: [mockRow], error: null })
    );

    const entries = await repo.read({ tenantId: "t1" });

    expect(entries).toHaveLength(1);
    const entry = entries[0];

    expect(entry.tenantId).toBe("t1");
    expect(entry.actorUserId).toBe("aaaa-0000-aaaa-0000");
    expect(entry.targetUserId).toBe("bbbb-1111-bbbb-1111");
    expect(entry.action).toBe("user.update");
    expect(entry.source).toBe("web");
    expect(entry.oldValue).toEqual({ display_name: "Old Name" });
    expect(entry.newValue).toEqual({
      display_name: "New Name",
      phone: "+5491112345678",
    });
    expect(entry.occurredAt).toBeInstanceOf(Date);
    expect(entry.occurredAt.toISOString()).toBe("2026-06-06T12:00:00.000Z");
  });

  // ---- read() — handles null actor/target ----------------------------------

  it("read: maps null actor_user_id and target_user_id correctly", async () => {
    const mockRow = makeRow({
      actor_user_id: null,
      target_user_id: null,
      old_value: null,
      new_value: null,
    });

    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: [mockRow], error: null })
    );

    const entries = await repo.read({ tenantId: "t1" });

    expect(entries[0].actorUserId).toBeNull();
    expect(entries[0].targetUserId).toBeNull();
    expect(entries[0].oldValue).toBeNull();
    expect(entries[0].newValue).toBeNull();
  });

  // ---- read() — error handling ---------------------------------------------

  it("read: throws on Supabase error", async () => {
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({
        data: null,
        error: { message: "Permission denied", code: "42501" },
      })
    );

    await expect(repo.read({ tenantId: "t1" })).rejects.toThrow(
      "Failed to read audit entries"
    );
  });

  // ---- read() — empty results ----------------------------------------------

  it("read: returns empty array when no rows match", async () => {
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: [], error: null })
    );

    const entries = await repo.read({ tenantId: "t2" });

    expect(entries).toEqual([]);
    expect(entries).toHaveLength(0);
  });

  // ---- read() — multiple rows ----------------------------------------------

  it("read: maps multiple rows correctly", async () => {
    const rows = [
      makeRow({ action: "user.create", occurred_at: "2026-06-06T10:00:00Z" }),
      makeRow({ action: "user.update", occurred_at: "2026-06-06T11:00:00Z" }),
      makeRow({ action: "user.deactivate", occurred_at: "2026-06-06T12:00:00Z" }),
    ];

    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: rows, error: null })
    );

    const entries = await repo.read({ tenantId: "t1", limit: 3 });

    expect(entries).toHaveLength(3);
    expect(entries[0].action).toBe("user.create");
    expect(entries[1].action).toBe("user.update");
    expect(entries[2].action).toBe("user.deactivate");
  });

  // ---- read() — handles null data gracefully -------------------------------

  it("read: returns empty array when data is null", async () => {
    qb.then.mockImplementation((resolve: (value: unknown) => void) =>
      resolve({ data: null, error: null })
    );

    const entries = await repo.read({ tenantId: "t1" });

    expect(entries).toEqual([]);
  });
});
