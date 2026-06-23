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
    const { service } = createService();

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

  it("maps create/update repository errors", async () => {
    const { service } = createService({
      repository: {
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
