import { describe, expect, it } from "vitest";

import {
  GetValidationConfigServiceImpl,
  resolveEffectiveValidationConfig,
  type ValidationConfigRepository,
} from "./get-validation-config";
import { CapabilityDeniedError } from "../auth/effective-capabilities";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function createRepository(
  overrides: Partial<ValidationConfigRepository> = {}
): ValidationConfigRepository {
  return {
    getTenantUserContext: async ({ tenantId, userId }) => ({
      tenantId,
      userId,
      tenantStatus: "active",
      userStatus: "active",
    }),
    getTenantOverride: async () => null,
    listUserRoleIds: async () => ["role-1"],
    listCapabilitiesForRoles: async () => ["whatsapp.channel.access"],
    listUserCapabilityOverrides: async () => [],
    ...overrides,
  };
}

describe("validation config service", () => {
  it("returns system defaults when the tenant has no override", async () => {
    const service = new GetValidationConfigServiceImpl(createRepository());

    const result = await service.getConfig({
      tenantId: ` ${TENANT_ID} `,
      userId: ` ${USER_ID} `,
      tipo: "inicio_jornada",
    });

    expect(result).toEqual({
      ok: true,
      config: {
        tipo: "inicio_jornada",
        tenantId: TENANT_ID,
        source: "system_default",
        campos: {
          maquinaId: { obligatorio: true, tipo: "uuid" },
          horometroInicial: { obligatorio: true, tipo: "number" },
          fotoHorometro: { obligatorio: false, tipo: "image" },
          combustibleInicial: { obligatorio: false, tipo: "number" },
          subproyectoId: { obligatorio: false, tipo: "uuid" },
        },
      },
    });
  });

  it("merges tenant overrides over system defaults", async () => {
    const service = new GetValidationConfigServiceImpl(
      createRepository({
        getTenantOverride: async () => ({
          campos: {
            fotoHorometro: { obligatorio: true },
            combustibleInicial: { obligatorio: true, tipo: "number" },
          },
        }),
      })
    );

    const result = await service.getConfig({
      tenantId: TENANT_ID,
      userId: USER_ID,
      tipo: "inicio_jornada",
    });

    expect(result).toEqual({
      ok: true,
      config: {
        tipo: "inicio_jornada",
        tenantId: TENANT_ID,
        source: "tenant_override",
        campos: expect.objectContaining({
          fotoHorometro: { obligatorio: true, tipo: "image" },
          combustibleInicial: { obligatorio: true, tipo: "number" },
        }),
      },
    });
  });

  it("returns TIPO_INVALIDO for unsupported tipos", async () => {
    const service = new GetValidationConfigServiceImpl(createRepository());

    await expect(
      service.getConfig({
        tenantId: TENANT_ID,
        userId: USER_ID,
        tipo: "otro",
      })
    ).resolves.toEqual({ ok: false, errorCode: "TIPO_INVALIDO" });
  });

  it("returns TENANT_INVALIDO for malformed tenant or user identifiers", async () => {
    const service = new GetValidationConfigServiceImpl(createRepository());

    await expect(
      service.getConfig({
        tenantId: "tenant-1",
        userId: USER_ID,
        tipo: "gasto",
      })
    ).resolves.toEqual({ ok: false, errorCode: "TENANT_INVALIDO" });
    await expect(
      service.getConfig({
        tenantId: TENANT_ID,
        userId: "user-1",
        tipo: "gasto",
      })
    ).resolves.toEqual({ ok: false, errorCode: "TENANT_INVALIDO" });
  });

  it("returns TENANT_INVALIDO when tenant or user context is missing or inactive", async () => {
    const missingContextService = new GetValidationConfigServiceImpl(
      createRepository({ getTenantUserContext: async () => null })
    );
    const inactiveContextService = new GetValidationConfigServiceImpl(
      createRepository({
        getTenantUserContext: async ({ tenantId, userId }) => ({
          tenantId,
          userId,
          tenantStatus: "active",
          userStatus: "inactive",
        }),
      })
    );

    await expect(
      missingContextService.getConfig({
        tenantId: TENANT_ID,
        userId: USER_ID,
        tipo: "gasto",
      })
    ).resolves.toEqual({ ok: false, errorCode: "TENANT_INVALIDO" });
    await expect(
      inactiveContextService.getConfig({
        tenantId: TENANT_ID,
        userId: USER_ID,
        tipo: "gasto",
      })
    ).resolves.toEqual({ ok: false, errorCode: "TENANT_INVALIDO" });
  });

  it("returns PERMISO_DENEGADO when the caller lacks whatsapp.channel.access", async () => {
    const service = new GetValidationConfigServiceImpl(
      createRepository({
        listCapabilitiesForRoles: async () => [],
        listUserCapabilityOverrides: async () => [],
      })
    );

    await expect(
      service.getConfig({
        tenantId: TENANT_ID,
        userId: USER_ID,
        tipo: "gasto",
      })
    ).resolves.toEqual({ ok: false, errorCode: "PERMISO_DENEGADO" });
  });

  it("propagates unexpected capability resolver failures", async () => {
    const service = new GetValidationConfigServiceImpl(
      createRepository({
        listCapabilitiesForRoles: async () => {
          throw new Error("capability lookup failed");
        },
      })
    );

    await expect(
      service.getConfig({
        tenantId: TENANT_ID,
        userId: USER_ID,
        tipo: "gasto",
      })
    ).rejects.toThrow("capability lookup failed");
  });

  it("returns CONFIG_INVALIDA when the stored override shape is unsafe", async () => {
    const service = new GetValidationConfigServiceImpl(
      createRepository({
        getTenantOverride: async () => ({
          campos: {
            campoInventado: { obligatorio: true },
          },
        }),
      })
    );

    await expect(
      service.getConfig({
        tenantId: TENANT_ID,
        userId: USER_ID,
        tipo: "inicio_jornada",
      })
    ).resolves.toEqual({ ok: false, errorCode: "CONFIG_INVALIDA" });
  });
});

describe("resolveEffectiveValidationConfig", () => {
  it("rejects unknown field overrides", () => {
    expect(() =>
      resolveEffectiveValidationConfig("gasto", {
        campos: {
          unknownField: { obligatorio: true },
        },
      })
    ).toThrow("Unknown validation field override");
  });

  it("rejects invalid field types inside overrides", () => {
    expect(() =>
      resolveEffectiveValidationConfig("gasto", {
        campos: {
          monto: { tipo: "money" },
        },
      })
    ).toThrow("Validation config override tipo for monto is invalid.");
  });

  it("keeps CapabilityDeniedError semantics compatible with the auth resolver", () => {
    const error = new CapabilityDeniedError(
      USER_ID,
      TENANT_ID,
      "whatsapp.channel.access"
    );

    expect(error.code).toBe("capability_denied");
  });
});
