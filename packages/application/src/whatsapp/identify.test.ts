import { describe, expect, it } from "vitest";
import {
  WhatsappIdentifyServiceImpl,
  type WhatsappIdentityRepository,
} from "./identify";

function createRepository(
  overrides: Partial<WhatsappIdentityRepository> = {}
): WhatsappIdentityRepository {
  return {
    findByNormalizedPhone: async () => ({
      userId: "user-1",
      userName: "Juan Pérez",
      tenantId: "tenant-1",
      userStatus: "active",
      tenantStatus: "active",
    }),
    listRoleAssignments: async () => [
      { roleId: "role-1", roleName: "operador", isWebAccess: false },
    ],
    listCapabilitiesForRoles: async () => ["whatsapp.channel.access"],
    listUserCapabilityOverrides: async () => [],
    ...overrides,
  };
}

describe("WhatsappIdentifyServiceImpl", () => {
  it("returns identity context for an active operational user", async () => {
    const service = new WhatsappIdentifyServiceImpl(createRepository());

    await expect(
      service.identify({
        phone: "+54 9 11 1234-5678",
        requiredCapability: "whatsapp.channel.access",
      })
    ).resolves.toEqual({
      ok: true,
      user: {
        userId: "user-1",
        userName: "Juan Pérez",
        tenantId: "tenant-1",
        roles: ["operador"],
        capabilities: ["whatsapp.channel.access"],
      },
    });
  });

  it("returns effective capabilities from every assigned role after the WhatsApp role check passes", async () => {
    const service = new WhatsappIdentifyServiceImpl(
      createRepository({
        listRoleAssignments: async () => [
          { roleId: "role-1", roleName: "operador", isWebAccess: false },
          { roleId: "role-2", roleName: "supervisor", isWebAccess: true },
        ],
        listCapabilitiesForRoles: async ({ roleIds }) =>
          roleIds.includes("role-2")
            ? ["whatsapp.channel.access", "projects:read"]
            : ["whatsapp.channel.access"],
      })
    );

    await expect(
      service.identify({
        phone: "+54 9 11 1234-5678",
        requiredCapability: "whatsapp.channel.access",
      })
    ).resolves.toMatchObject({
      ok: true,
      user: {
        roles: ["operador", "supervisor"],
        capabilities: ["projects:read", "whatsapp.channel.access"],
      },
    });
  });

  it.each([
    [
      "USUARIO_NO_REGISTRADO",
      createRepository({ findByNormalizedPhone: async () => null }),
    ],
    [
      "USUARIO_INACTIVO",
      createRepository({
        findByNormalizedPhone: async () => ({
          userId: "user-1",
          userName: "Juan Pérez",
          tenantId: "tenant-1",
          userStatus: "inactive",
          tenantStatus: "active",
        }),
      }),
    ],
    [
      "TENANT_INVALIDO",
      createRepository({
        findByNormalizedPhone: async () => ({
          userId: "user-1",
          userName: "Juan Pérez",
          tenantId: "tenant-1",
          userStatus: "active",
          tenantStatus: "inactive",
        }),
      }),
    ],
    [
      "ROL_NO_WHATSAPP",
      createRepository({
        listRoleAssignments: async () => [
          { roleId: "role-1", roleName: "supervisor", isWebAccess: true },
        ],
      }),
    ],
    [
      "PERMISO_DENEGADO",
      createRepository({ listCapabilitiesForRoles: async () => [] }),
    ],
  ] as const)("returns %s when policy fails", async (errorCode, repository) => {
    const service = new WhatsappIdentifyServiceImpl(repository);
    await expect(
      service.identify({
        phone: "+54 9 11 1234-5678",
        requiredCapability: "whatsapp.channel.access",
      })
    ).resolves.toEqual({ ok: false, errorCode });
  });
});
