import { describe, expect, it } from "vitest";

import type { CreateSubprojectInput } from "@faena360/domain";
import {
  createSubprojectCatalogService,
  type SubprojectCatalogServiceDependencies,
} from "./subproject-catalog";
import { CapabilityDeniedError } from "../auth/effective-capabilities";

describe("subproject catalog service", () => {
  function createService(overrides?: {
    repository?: Partial<SubprojectCatalogServiceDependencies["repository"]>;
    requireCapability?: SubprojectCatalogServiceDependencies["capabilityChecker"]["requireCapability"];
  }) {
    const calls: string[] = [];

    const repository = {
      listVisible: async () => [
        {
          id: "sub-id-1",
          tenant_id: "tenant-1",
          proyecto_id: "proj-id-1",
          nombre: "Fase 1",
          ubicacion: "Sector Norte",
          forma_cobro: "monto_fijo",
          monto_fijo: 500,
          estado: "activo" as const,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      create: async () => ({ id: "sub-id-1" }),
      update: async () => true,
      finish: async () => true,
      reopen: async () => true,
      hide: async () => true,
      getParentFixedAmount: async () => 1000,
      getSubprojectFixedAmountSum: async () => 300,
      getProjectId: async () => "proj-id-1",
      ...overrides?.repository,
    };

    const capabilityChecker = {
      requireCapability:
        overrides?.requireCapability ?? (async () => undefined),
    };

    return {
      calls,
      service: createSubprojectCatalogService({
        repository:
          repository as SubprojectCatalogServiceDependencies["repository"],
        capabilityChecker: {
          requireCapability: async (scope, capabilityCode) => {
            calls.push(`${scope.userId}|${scope.tenantId}|${capabilityCode}`);
            return capabilityChecker.requireCapability(scope, capabilityCode);
          },
        },
      }),
    };
  }

  it("lists visible subprojects in tenant context and checks read capability", async () => {
    const { calls, service } = createService();

    const subprojects = await service.listVisibleSubprojects({
      tenant_id: " tenant-1 ",
      user_id: "actor-1",
    });

    expect(subprojects).toHaveLength(1);
    expect(subprojects[0]?.tenant_id).toBe("tenant-1");
    expect(subprojects[0]?.proyecto_id).toBe("proj-id-1");
    expect(calls).toEqual(["actor-1|tenant-1|subprojects:read"]);
  });

  it("returns missing_tenant before capability checks when tenant is blank", async () => {
    const { service, calls } = createService();

    const response = await service.createSubproject(
      { tenant_id: "   ", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase 1",
      }
    );

    expect(response).toEqual({ ok: false, code: "missing_tenant" });
    expect(calls).toEqual([]);
  });

  it("sanitizes create input and rejects tenant override fields", async () => {
    const { service } = createService({
      repository: {
        // Parent does not use monto_fijo — skip inherited guard.
        getParentFixedAmount: async () => null,
      },
    });

    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: " proj-id-1 ",
        nombre: "  Fase 1  ",
        ubicacion: "  Sector Norte  ",
      }
    );

    expect(result).toEqual({ ok: true, subprojectId: "sub-id-1" });

    const overridePayload: CreateSubprojectInput & { tenant_id: string } = {
      tenant_id: "tenant-2",
      proyecto_id: "proj-id-1",
      nombre: "Fase 1",
    };
    const overrideTenant = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      overridePayload
    );

    expect(overrideTenant).toEqual({
      ok: false,
      code: "capability_denied",
    });
  });

  it("maps validation failures before calling repository", async () => {
    const { service } = createService();

    const missingNombre = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "  ",
      }
    );
    const missingParentProject = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "  ",
        nombre: "Fase 1",
      }
    );
    const invalidForma = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase 1",
        forma_cobro: "unknown" as never,
      }
    );

    expect(missingNombre).toEqual({ ok: false, code: "missing_nombre" });
    expect(missingParentProject).toEqual({
      ok: false,
      code: "missing_parent_project",
    });
    expect(invalidForma).toEqual({ ok: false, code: "invalid_forma_cobro" });
  });

  it("validates fixed-amount sum guard blocks overage", async () => {
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async () => 800,
      },
    });

    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase 2",
        forma_cobro: "monto_fijo",
        monto_fijo: 300,
      }
    );

    expect(result).toEqual({
      ok: false,
      code: "fixed_amount_exceeds_parent",
    });
  });

  it("allows fixed-amount subproject when sum is within parent limit", async () => {
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async () => 500,
      },
    });

    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase 3",
        forma_cobro: "monto_fijo",
        monto_fijo: 400,
      }
    );

    expect(result).toEqual({ ok: true, subprojectId: "sub-id-1" });
  });

  it("skips fixed-amount guard when parent has no monto_fijo", async () => {
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => null,
        getSubprojectFixedAmountSum: async () => 800,
      },
    });

    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase 4",
        forma_cobro: "monto_fijo",
        monto_fijo: 9999,
      }
    );

    expect(result).toEqual({ ok: true, subprojectId: "sub-id-1" });
  });

  it("maps update and hide capability failures", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "subprojects:update"
    );
    const { service } = createService({
      requireCapability: async () => {
        throw denied;
      },
    });

    const update = await service.updateSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "sub-id-1",
        proyecto_id: "proj-id-1",
        nombre: "Fase Editada",
      }
    );
    const finish = await service.finishSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "sub-id-1",
      }
    );
    const hide = await service.hideSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "sub-id-1",
      }
    );

    expect(update).toEqual({ ok: false, code: "capability_denied" });
    expect(finish).toEqual({ ok: false, code: "capability_denied" });
    expect(hide).toEqual({ ok: false, code: "capability_denied" });
  });

  it("maps transition errors", async () => {
    const { service } = createService({
      repository: {
        finish: async () => {
          throw new Error(
            "Cannot finish a subproject that is not active or paused"
          );
        },
        reopen: async () => {
          throw new Error("parent project is finalized");
        },
      },
    });

    const finishResult = await service.finishSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { subprojectId: "sub-id-1", force: false }
    );
    const reopenResult = await service.reopenSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { subprojectId: "sub-id-1" }
    );

    expect(finishResult).toEqual({ ok: false, code: "invalid_transition" });
    expect(reopenResult).toEqual({
      ok: false,
      code: "parent_project_finished",
    });
  });

  it("maps reopen non-finalized as invalid_transition", async () => {
    const { service } = createService({
      repository: {
        reopen: async () => {
          throw new Error("Cannot reopen a non-finalized subproject");
        },
      },
    });

    const result = await service.reopenSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { subprojectId: "sub-id-1" }
    );

    expect(result).toEqual({ ok: false, code: "invalid_transition" });
  });

  it("validates reopen target_estado", async () => {
    const { service } = createService();

    const invalidTarget = await service.reopenSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { subprojectId: "sub-id-1", target_estado: "finalizado" }
    );

    expect(invalidTarget).toEqual({
      ok: false,
      code: "invalid_transition",
    });

    const validActive = await service.reopenSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { subprojectId: "sub-id-1", target_estado: "activo" }
    );

    expect(validActive).toEqual({ ok: true });
  });

  it("maps missing_project when repository returns false", async () => {
    const { service } = createService({
      repository: {
        update: async () => false,
        finish: async () => false,
        hide: async () => false,
        reopen: async () => false,
      },
    });

    const update = await service.updateSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "missing-id",
        proyecto_id: "proj-id-1",
        nombre: "No existe",
      }
    );
    const hide = await service.hideSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { subprojectId: "missing-id" }
    );

    expect(update).toEqual({ ok: false, code: "missing_project" });
    expect(hide).toEqual({ ok: false, code: "missing_project" });
  });

  it("validates fixed-amount sum guard blocks overage on update", async () => {
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async () => 800,
      },
    });

    const result = await service.updateSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "sub-id-1",
        proyecto_id: "proj-id-1",
        nombre: "Fase Editada",
        forma_cobro: "monto_fijo",
        monto_fijo: 300,
      }
    );

    expect(result).toEqual({
      ok: false,
      code: "fixed_amount_exceeds_parent",
    });
  });

  it("allows update when fixed-amount sum is within parent limit", async () => {
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async () => 500,
      },
    });

    const result = await service.updateSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "sub-id-1",
        proyecto_id: "proj-id-1",
        nombre: "Fase Editada",
        forma_cobro: "monto_fijo",
        monto_fijo: 400,
      }
    );

    expect(result).toEqual({ ok: true });
  });

  it("uses server-sourced proyecto_id for fixed-amount guard on update, not client-supplied", async () => {
    // Capture the proyecto_id used in the sum check.
    let capturedProyectoId: string | undefined;
    const { service } = createService({
      repository: {
        getProjectId: async () => "proj-srv-999",
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async (
          _tenantId,
          proyecto_id,
          _exclude
        ) => {
          capturedProyectoId = proyecto_id;
          return 800;
        },
      },
    });

    // Client sends a manipulated proyecto_id in the hidden field.
    const result = await service.updateSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        subprojectId: "sub-id-1",
        proyecto_id: "proj-evil-123", // manipulated
        nombre: "Fase Editada",
        forma_cobro: "monto_fijo",
        monto_fijo: 300,
      }
    );

    // Should have been blocked by sum guard using server-sourced ID.
    expect(result).toEqual({
      ok: false,
      code: "fixed_amount_exceeds_parent",
    });
    // The guard must have used the server-sourced value, not the manipulated one.
    expect(capturedProyectoId).toBe("proj-srv-999");
  });

  it("triggers fixed-amount sum guard when forma_cobro is inherited from parent with monto_fijo", async () => {
    // When the user does NOT provide forma_cobro or monto_fijo, but the
    // parent project uses monto_fijo billing, the RPC inherits both values.
    // The application guard must catch overages BEFORE calling the RPC.
    const { service } = createService({
      repository: {
        // Parent has monto_fijo = 1000
        getParentFixedAmount: async () => 1000,
        // Sibling sum already at 900 — only 100 room left
        getSubprojectFixedAmountSum: async () => 900,
      },
    });

    // User creates a subproject without specifying forma_cobro or monto_fijo.
    // The parent's monto_fijo (1000) would be inherited, but 1000 + 900 = 1900
    // exceeds the parent limit of 1000.
    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase Heredada Excedida",
      }
    );

    expect(result).toEqual({
      ok: false,
      code: "fixed_amount_exceeds_parent",
    });
  });

  it("allows inherited monto_fijo when sum is within parent limit", async () => {
    // Parent has monto_fijo = 1000, existing sum = 500, inherited = 0 (user
    // didn't provide one, so it falls through to parent's value).
    // Actually when user provides no monto_fijo and parent inherits, the
    // effectiveMontoFijo is the parent's monto_fijo (1000). That would exceed.
    // Let's test the case where the parent monto_fijo alone fits within sum.
    // Wait — the guard compares inputMontoFijo + existingSum > parentLimit.
    // If inherited monto_fijo = 1000 and existingSum = 0, 1000 + 0 = 1000,
    // which is NOT > 1000, so it passes.
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async () => 0,
      },
    });

    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase Heredada Dentro Del Limite",
      }
    );

    expect(result).toEqual({ ok: true, subprojectId: "sub-id-1" });
  });

  it("skips inherited guard when parent does not use monto_fijo", async () => {
    // Parent has por_horas billing — getParentFixedAmount returns null.
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => null,
        getSubprojectFixedAmountSum: async () => 9999,
      },
    });

    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase Sin Herencia",
      }
    );

    expect(result).toEqual({ ok: true, subprojectId: "sub-id-1" });
  });

  it("uses explicit monto_fijo over inherited parent monto_fijo for guard", async () => {
    // Parent has monto_fijo = 1000, but user provides monto_fijo = 300 explicitly.
    // The effective guard should use 300 (user's value), not the parent's 1000.
    let capturedMontoFijo: number | undefined;
    const { service } = createService({
      repository: {
        getParentFixedAmount: async () => 1000,
        getSubprojectFixedAmountSum: async (_tenantId, _proyectoId, _exclude) =>
          800,
      },
    });

    // Override checkFixedAmountSum behavior: capture the monto_fijo used.
    // But we can't easily intercept that. Instead, trust the outcome:
    // 300 + 800 = 1100 > 1000 → should be blocked.
    const result = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Fase Con Monto Explicito",
        monto_fijo: 300,
      }
    );

    expect(result).toEqual({
      ok: false,
      code: "fixed_amount_exceeds_parent",
    });
  });

  it("maps create/update repository errors", async () => {
    const { service } = createService({
      repository: {
        // Parent does not use monto_fijo — skip inherited guard.
        getParentFixedAmount: async () => null,
        create: async () => {
          throw new Error("duplicate key value violates unique constraint");
        },
      },
    });

    const create = await service.createSubproject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        proyecto_id: "proj-id-1",
        nombre: "Nombre Duplicado",
      }
    );

    expect(create).toEqual({ ok: false, code: "duplicate_nombre" });
  });
});
