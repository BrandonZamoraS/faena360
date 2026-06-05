import { describe, expect, it } from "vitest";

import {
  CapabilityDeniedError,
  createEffectiveCapabilitiesResolver,
  InMemoryEffectiveCapabilitiesCache,
  type EffectiveCapabilitiesRepository,
} from "./effective-capabilities";

const scope = { tenantId: "tenant-1", userId: "user-1" };

function createRepository(
  overrides: Partial<EffectiveCapabilitiesRepository> = {}
): EffectiveCapabilitiesRepository {
  return {
    listCapabilitiesForRoles: async () => [],
    listUserCapabilityOverrides: async () => [],
    listUserRoleIds: async () => [],
    ...overrides,
  };
}

describe("effective capabilities", () => {
  it("returns an empty set when the user has no roles or allow overrides", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository(),
    });

    const result = await resolver.getEffectiveCapabilities(scope);

    expect([...result.capabilities]).toEqual([]);
  });

  it("unions multiple role capabilities without duplicates", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository({
        listCapabilitiesForRoles: async () => [
          "orders.read",
          "orders.read",
          "orders.write",
        ],
        listUserRoleIds: async () => ["admin", "operator"],
      }),
    });

    const result = await resolver.getEffectiveCapabilities(scope);

    expect([...result.capabilities].sort()).toEqual([
      "orders.read",
      "orders.write",
    ]);
  });

  it("lets deny overrides remove role-granted capabilities", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository({
        listCapabilitiesForRoles: async () => ["orders.read", "orders.write"],
        listUserCapabilityOverrides: async () => [
          { ...scope, capabilityCode: "orders.read", effect: "deny" },
        ],
        listUserRoleIds: async () => ["admin"],
      }),
    });

    const result = await resolver.getEffectiveCapabilities(scope);

    expect([...result.capabilities]).toEqual(["orders.write"]);
  });

  it("lets deny overrides win over allow overrides for the same capability", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository({
        listUserCapabilityOverrides: async () => [
          { ...scope, capabilityCode: "orders.approve", effect: "allow" },
          { ...scope, capabilityCode: "orders.approve", effect: "deny" },
        ],
      }),
    });

    const result = await resolver.getEffectiveCapabilities(scope);

    expect([...result.capabilities]).toEqual([]);
  });

  it("lets allow overrides add capabilities missing from roles", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository({
        listUserCapabilityOverrides: async () => [
          { ...scope, capabilityCode: "orders.approve", effect: "allow" },
        ],
      }),
    });

    const result = await resolver.getEffectiveCapabilities(scope);

    expect([...result.capabilities]).toEqual(["orders.approve"]);
  });

  it("reuses cached capabilities until invalidated", async () => {
    let reads = 0;
    const cache = new InMemoryEffectiveCapabilitiesCache(30_000);
    const resolver = createEffectiveCapabilitiesResolver({
      cache,
      repository: createRepository({
        listCapabilitiesForRoles: async () => {
          reads += 1;
          return ["orders.read"];
        },
        listUserRoleIds: async () => ["admin"],
      }),
    });

    await resolver.getEffectiveCapabilities(scope);
    await resolver.getEffectiveCapabilities(scope);
    await resolver.invalidateEffectiveCapabilities(scope);
    await resolver.getEffectiveCapabilities(scope);

    expect(reads).toBe(2);
  });

  it("refreshes cached capabilities after the TTL expires", async () => {
    let reads = 0;
    const cache = new InMemoryEffectiveCapabilitiesCache(0);
    const resolver = createEffectiveCapabilitiesResolver({
      cache,
      repository: createRepository({
        listCapabilitiesForRoles: async () => {
          reads += 1;
          return [`orders.read.${reads}`];
        },
        listUserRoleIds: async () => ["admin"],
      }),
    });

    await resolver.getEffectiveCapabilities(scope);
    const refreshed = await resolver.getEffectiveCapabilities(scope);

    expect(reads).toBe(2);
    expect([...refreshed.capabilities]).toEqual(["orders.read.2"]);
  });

  it("throws capability_denied when a required capability is missing", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository(),
    });

    await expect(
      resolver.requireCapability(scope, "orders.read")
    ).rejects.toMatchObject({
      code: "capability_denied",
    });
  });

  it("returns capabilities when a required capability is present", async () => {
    const resolver = createEffectiveCapabilitiesResolver({
      repository: createRepository({
        listCapabilitiesForRoles: async () => ["orders.read"],
        listUserRoleIds: async () => ["admin"],
      }),
    });

    await expect(
      resolver.requireCapability(scope, "orders.read")
    ).resolves.toMatchObject({
      capabilities: expect.any(Set),
    });
  });
});
