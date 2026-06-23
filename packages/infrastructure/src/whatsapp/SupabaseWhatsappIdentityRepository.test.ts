import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseWhatsappIdentityRepository } from "./SupabaseWhatsappIdentityRepository";

type QueryResult = { data: unknown; error: { message: string } | null };

function createQueryBuilder(result: QueryResult) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };

  return query;
}

describe("SupabaseWhatsappIdentityRepository", () => {
  it("findByNormalizedPhone uses the normalized DB helper and keeps tenant resolution scoped", async () => {
    const tenantQuery = createQueryBuilder({
      data: { id: "tenant-1", status: "active" },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: "user-1",
          user_name: "Juan Pérez",
          user_status: "active",
          tenant_id: "tenant-1",
        },
      ],
      error: null,
    });

    const client = {
      rpc,
      from: vi.fn((table: string) => {
        expect(table).toBe("tenants");
        return tenantQuery;
      }),
    } as unknown as SupabaseClient;

    const repository = new SupabaseWhatsappIdentityRepository(client);

    await expect(
      repository.findByNormalizedPhone({ phone: "5491112345678" })
    ).resolves.toEqual({
      userId: "user-1",
      userName: "Juan Pérez",
      tenantId: "tenant-1",
      userStatus: "active",
      tenantStatus: "active",
    });

    expect(rpc).toHaveBeenCalledWith("find_whatsapp_identity_by_phone", {
      lookup_phone: "5491112345678",
    });
    expect(tenantQuery.select).toHaveBeenCalledWith("id, status");
    expect(tenantQuery.eq).toHaveBeenCalledWith("id", "tenant-1");
  });
});
