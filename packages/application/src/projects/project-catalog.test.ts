import { describe, expect, it } from "vitest";

import type { CreateProjectInput } from "@faena360/domain";
import {
  createProjectCatalogService,
  type ProjectCatalogServiceDependencies,
} from "./project-catalog";
import { CapabilityDeniedError } from "../auth/effective-capabilities";

describe("project catalog service", () => {
  function createService(overrides?: {
    repository?: Partial<ProjectCatalogServiceDependencies["repository"]>;
    requireCapability?: ProjectCatalogServiceDependencies["capabilityChecker"]["requireCapability"];
  }) {
    const calls: string[] = [];

    const repository = {
      listVisible: async () => [
        {
          id: "project-id-1",
          tenant_id: "tenant-1",
          nombre: "Proyecto Uno",
          cliente_id: "cliente-id-1",
          ubicacion: "Plaza",
          fecha_inicio: "2026-06-01",
          fecha_finalizacion: null,
          forma_cobro: "monto_fijo",
          monto_fijo: 2500,
          estado: "activo",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      create: async () => ({ id: "project-id-1" }),
      update: async () => true,
      pause: async () => true,
      finish: async () => true,
      reopen: async () => true,
      hide: async () => true,
      ...overrides?.repository,
    };

    const capabilityChecker = {
      requireCapability:
        overrides?.requireCapability ?? (async () => undefined),
    };

    return {
      calls,
      service: createProjectCatalogService({
        repository:
          repository as ProjectCatalogServiceDependencies["repository"],
        capabilityChecker: {
          requireCapability: async (scope, capabilityCode) => {
            calls.push(`${scope.userId}|${scope.tenantId}|${capabilityCode}`);
            return capabilityChecker.requireCapability(scope, capabilityCode);
          },
        },
      }),
    };
  }

  it("lists visible projects in tenant context and checks read capability", async () => {
    const { calls, service } = createService();

    const projects = await service.listVisibleProjects({
      tenant_id: " tenant-1 ",
      user_id: "actor-1",
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]?.tenant_id).toBe("tenant-1");
    expect(calls).toEqual(["actor-1|tenant-1|projects:read"]);
  });

  it("returns missing_tenant before capability checks when tenant is blank", async () => {
    const { service, calls } = createService();

    const response = await service.createProject(
      { tenant_id: "   ", user_id: "actor-1" },
      {
        nombre: "Proyecto",
        cliente_id: "client-id",
        ubicacion: "Oficina",
        fecha_inicio: "2026-06-01",
        forma_cobro: "por_dia",
      }
    );

    expect(response).toEqual({ ok: false, code: "missing_tenant" });
    expect(calls).toEqual([]);
  });

  it("sanitizes create input and rejects tenant override fields", async () => {
    const { service } = createService();

    const blocked = await service.createProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        nombre: "  Proyecto Uno  ",
        cliente_id: " client-id  ",
        ubicacion: "  Plaza  ",
        fecha_inicio: "2026-06-01",
        forma_cobro: "monto_fijo",
        monto_fijo: 100,
      }
    );

    expect(blocked).toEqual({ ok: true, projectId: "project-id-1" });

    const overridePayload: CreateProjectInput & { tenant_id: string } = {
      tenant_id: "tenant-2",
      nombre: "Proyecto",
      cliente_id: "cliente-id",
      ubicacion: "Plaza",
      fecha_inicio: "2026-06-01",
      forma_cobro: "por_horas",
    };
    const overrideTenant = await service.createProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      overridePayload
    );

    expect(overrideTenant).toEqual({ ok: false, code: "capability_denied" });
  });

  it("maps validation failures before calling repository", async () => {
    const { service } = createService();

    const missingNombre = await service.createProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        nombre: "  ",
        cliente_id: "cliente-id",
        ubicacion: "Plaza",
        fecha_inicio: "2026-06-01",
        forma_cobro: "monto_fijo",
        monto_fijo: 100,
      }
    );
    const invalidForma = await service.createProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        nombre: "Proyecto",
        cliente_id: "cliente-id",
        ubicacion: "Plaza",
        fecha_inicio: "2026-06-01",
        forma_cobro: "unknown",
      }
    );
    const missingMontoFijo = await service.createProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        nombre: "Proyecto",
        cliente_id: "cliente-id",
        ubicacion: "Plaza",
        fecha_inicio: "2026-06-01",
        forma_cobro: "monto_fijo",
      }
    );

    expect(missingNombre).toEqual({ ok: false, code: "missing_nombre" });
    expect(invalidForma).toEqual({ ok: false, code: "invalid_forma_cobro" });
    expect(missingMontoFijo).toEqual({ ok: false, code: "missing_monto_fijo" });
  });

  it("maps update and hide capability failures", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "projects:update"
    );
    const { service } = createService({
      requireCapability: async () => {
        throw denied;
      },
    });

    const update = await service.updateProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        projectId: "project-id-1",
        nombre: "Proyecto",
        cliente_id: "cliente-id",
        ubicacion: "Plaza",
        fecha_inicio: "2026-06-01",
        forma_cobro: "por_horas",
      }
    );
    const pause = await service.pauseProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        projectId: "project-id-1",
        force: true,
      }
    );
    const hide = await service.hideProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        projectId: "project-id-1",
      }
    );

    expect(update).toEqual({ ok: false, code: "capability_denied" });
    expect(pause).toEqual({ ok: false, code: "capability_denied" });
    expect(hide).toEqual({ ok: false, code: "capability_denied" });
  });

  it("maps transition errors", async () => {
    const { service } = createService({
      repository: {
        pause: async () => {
          throw new Error(
            "Project has 1 open jornadas. Use force=true to proceed."
          );
        },
        finish: async () => {
          throw new Error(
            "Cannot finish a project that is not active or paused"
          );
        },
        reopen: async () => {
          throw new Error("Reopen target state must be activo or pausado");
        },
      },
    });

    const pauseResult = await service.pauseProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { projectId: "project-id-1", force: false }
    );
    const finishResult = await service.finishProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { projectId: "project-id-1", force: false }
    );
    const reopenResult = await service.reopenProject(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { projectId: "project-id-1" }
    );

    expect(pauseResult).toEqual({ ok: false, code: "open_jornadas_blocking" });
    expect(finishResult).toEqual({ ok: false, code: "invalid_transition" });
    expect(reopenResult).toEqual({ ok: false, code: "invalid_transition" });
  });
});
