import { describe, expect, it } from "vitest";

import type { CreateAssignmentInput } from "@faena360/domain";
import {
  createMachineAssignmentService,
  type MachineAssignmentServiceDependencies,
} from "./machine-assignment";
import { CapabilityDeniedError } from "../auth/effective-capabilities";

describe("machine assignment service", () => {
  function createService(overrides?: {
    repository?: Partial<MachineAssignmentServiceDependencies["repository"]>;
    requireCapability?: MachineAssignmentServiceDependencies["capabilityChecker"]["requireCapability"];
  }) {
    const capabilityCalls: string[] = [];
    const repositoryCalls = {
      listActive: [] as string[],
      listHistory: [] as Array<Record<string, unknown>>,
      create: [] as Array<Record<string, unknown>>,
      updateStatus: [] as Array<Record<string, unknown>>,
    };

    const repository = {
      listActive: async ({ tenantId }: { tenantId: string }) => {
        repositoryCalls.listActive.push(tenantId);
        return [
          {
            id: "assignment-1",
            tenant_id: tenantId,
            maquina_id: "machine-1",
            proyecto_id: "project-1",
            subproyecto_id: null,
            operador_id: "user-1",
            tarifa_aplicada: 150,
            estado: "activa" as const,
            fecha_inicio: "2026-06-23T00:00:00.000Z",
            fecha_fin: null,
            created_at: "2026-06-23T00:00:00.000Z",
            updated_at: "2026-06-23T00:00:00.000Z",
          },
        ];
      },
      create: async (input: Record<string, unknown>) => {
        repositoryCalls.create.push(input);
        return { id: "assignment-new" };
      },
      updateStatus: async (input: Record<string, unknown>) => {
        repositoryCalls.updateStatus.push(input);
        return true;
      },
      listHistory: async (input: Record<string, unknown>) => {
        repositoryCalls.listHistory.push(input);
        return [
          {
            occurred_at: "2026-06-23T10:00:00.000Z",
            action: "asignacion.created",
            actor_user_id: "actor-1",
            old_value: null,
            new_value: {
              id: "assignment-1",
              estado: "activa",
              tarifa_aplicada: 150,
            },
            source: "web",
          },
        ];
      },
      ...overrides?.repository,
    };

    const service = createMachineAssignmentService({
      repository:
        repository as MachineAssignmentServiceDependencies["repository"],
      capabilityChecker: {
        requireCapability: async (scope, capabilityCode) => {
          capabilityCalls.push(
            `${scope.userId}|${scope.tenantId}|${capabilityCode}`
          );
          return overrides?.requireCapability?.(scope, capabilityCode);
        },
      },
    });

    return { service, capabilityCalls, repositoryCalls };
  }

  it("lists active assignments after assignments:read", async () => {
    const { service, capabilityCalls, repositoryCalls } = createService();

    const result = await service.listActiveAssignments({
      tenant_id: " tenant-1 ",
      user_id: "actor-1",
    });

    expect(capabilityCalls).toEqual(["actor-1|tenant-1|assignments:read"]);
    expect(repositoryCalls.listActive).toEqual(["tenant-1"]);
    expect(result[0]?.tenant_id).toBe("tenant-1");
    expect(result[0]?.estado).toBe("activa");
  });

  it("requires assignments:create before persisting", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "assignments:create"
    );
    const { service, repositoryCalls } = createService({
      requireCapability: async () => {
        throw denied;
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
    expect(repositoryCalls.create).toHaveLength(0);
  });

  it("rejects missing tenant on create and update", async () => {
    const { service } = createService();

    const createResult = await service.createAssignment(
      { tenant_id: "   ", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    const updateResult = await service.updateAssignmentStatus(
      { tenant_id: "   ", user_id: "actor-1" },
      "assignment-1",
      "retirada_del_proyecto"
    );

    expect(createResult).toEqual({ ok: false, code: "missing_tenant" });
    expect(updateResult).toEqual({ ok: false, code: "missing_tenant" });
  });

  it("normalizes input and rejects blank fields", async () => {
    const { service, repositoryCalls } = createService();

    const missingMaquina = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "   ",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );
    const missingProyecto = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "   ",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );
    const missingOperador = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "   ",
        tarifa_aplicada: 150,
      }
    );
    const missingTarifa = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: -1,
      }
    );

    expect(missingMaquina).toEqual({ ok: false, code: "missing_maquina" });
    expect(missingProyecto).toEqual({ ok: false, code: "missing_proyecto" });
    expect(missingOperador).toEqual({ ok: false, code: "missing_operador" });
    expect(missingTarifa).toEqual({ ok: false, code: "missing_tarifa" });
    expect(repositoryCalls.create).toHaveLength(0);
  });

  it("creates assignment successfully with normalized input", async () => {
    const { service, repositoryCalls } = createService();

    const result = await service.createAssignment(
      { tenant_id: " tenant-2 ", user_id: "actor-2" },
      {
        maquina_id: "  machine-1  ",
        proyecto_id: "  project-1  ",
        subproyecto_id: "  sub-1  ",
        operador_id: "  user-1  ",
        tarifa_aplicada: 200,
      }
    );

    expect(result).toEqual({ ok: true, assignmentId: "assignment-new" });
    expect(repositoryCalls.create).toHaveLength(1);
    expect(repositoryCalls.create[0]).toMatchObject({
      tenantId: "tenant-2",
      actorId: "actor-2",
      auditSource: "web",
      maquina_id: "machine-1",
      proyecto_id: "project-1",
      subproyecto_id: "sub-1",
      operador_id: "user-1",
      tarifa_aplicada: 200,
    });
  });

  it("maps duplicate machine assignment error (23505)", async () => {
    const { service } = createService({
      repository: {
        create: async () => {
          const error = new Error("duplicate key") as Error & { code: string };
          error.code = "23505";
          throw error;
        },
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-2",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "machine_already_assigned" });
  });

  it("maps MCH02 (machine not por_tiempo) RPC error", async () => {
    const { service } = createService({
      repository: {
        create: async () => {
          const error = new Error(
            "Only por_tiempo machines can be assigned"
          ) as Error & { code: string };
          error.code = "MCH02";
          throw error;
        },
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "machine_not_por_tiempo" });
  });

  it("maps MCH03 (machine not active) RPC error", async () => {
    const { service } = createService({
      repository: {
        create: async () => {
          const error = new Error("Machine must be active") as Error & {
            code: string;
          };
          error.code = "MCH03";
          throw error;
        },
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "machine_not_active" });
  });

  it("maps PRJ02 (project not active) RPC error", async () => {
    const { service } = createService({
      repository: {
        create: async () => {
          const error = new Error("Project must be active") as Error & {
            code: string;
          };
          error.code = "PRJ02";
          throw error;
        },
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "project_not_active" });
  });

  it("maps USR01 (user not operador) RPC error", async () => {
    const { service } = createService({
      repository: {
        create: async () => {
          const error = new Error("Not an operador") as Error & {
            code: string;
          };
          error.code = "USR01";
          throw error;
        },
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "user_not_operador" });
  });

  it("falls back to assignment_create_failed for unmapped RPC codes (MCH01, PRJ01, SUB01)", async () => {
    const unmappedCodes = ["MCH01", "PRJ01", "SUB01"];

    for (const code of unmappedCodes) {
      const { service } = createService({
        repository: {
          create: async () => {
            const error = new Error("validation error") as Error & {
              code: string;
            };
            error.code = code;
            throw error;
          },
        },
      });

      const result = await service.createAssignment(
        { tenant_id: "tenant-1", user_id: "actor-1" },
        {
          maquina_id: "machine-1",
          proyecto_id: "project-1",
          operador_id: "user-1",
          tarifa_aplicada: 150,
        }
      );

      expect(result).toEqual({ ok: false, code: "assignment_create_failed" });
    }
  });

  it("maps permission denied error (42501) to capability_denied", async () => {
    const { service } = createService({
      repository: {
        create: async () => {
          const error = new Error("permission denied") as Error & {
            code: string;
          };
          error.code = "42501";
          throw error;
        },
      },
    });

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
      }
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
  });

  it("updates assignment status successfully", async () => {
    const { service, repositoryCalls } = createService();

    const result = await service.updateAssignmentStatus(
      { tenant_id: " tenant-1 ", user_id: "actor-1" },
      "  assignment-1  ",
      "retirada_del_proyecto"
    );

    expect(result).toEqual({ ok: true });
    expect(repositoryCalls.updateStatus).toHaveLength(1);
    expect(repositoryCalls.updateStatus[0]).toMatchObject({
      tenantId: "tenant-1",
      assignmentId: "assignment-1",
      actorId: "actor-1",
      auditSource: "web",
      estado: "retirada_del_proyecto",
    });
  });

  it("requires assignments:update for status changes", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "assignments:update"
    );
    const { service, repositoryCalls } = createService({
      requireCapability: async () => {
        throw denied;
      },
    });

    const result = await service.updateAssignmentStatus(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      "assignment-1",
      "cerrada_por_finalizacion"
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
    expect(repositoryCalls.updateStatus).toHaveLength(0);
  });

  it("rejects blank assignment id for status update", async () => {
    const { service } = createService();

    const result = await service.updateAssignmentStatus(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      "   ",
      "retirada_del_proyecto"
    );

    expect(result).toEqual({ ok: false, code: "missing_assignment" });
  });

  it("rejects invalid estados for status update", async () => {
    const { service } = createService();

    const result = await service.updateAssignmentStatus(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      "assignment-1",
      "activa" as "retirada_del_proyecto"
    );

    expect(result).toEqual({ ok: false, code: "unknown_error" });
  });

  // --- listAssignmentHistory ---

  it("returns history for user with assignments:read capability", async () => {
    const { service, capabilityCalls, repositoryCalls } = createService();

    const result = await service.listAssignmentHistory(
      { tenant_id: " tenant-1 ", user_id: "actor-1" },
      "  assignment-1  "
    );

    expect(capabilityCalls).toEqual(["actor-1|tenant-1|assignments:read"]);
    expect(repositoryCalls.listHistory).toHaveLength(1);
    expect(repositoryCalls.listHistory[0]).toMatchObject({
      tenantId: "tenant-1",
      actorId: "actor-1",
      assignmentId: "assignment-1",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.action).toBe("asignacion.created");
  });

  it("rejects listAssignmentHistory without assignments:read capability", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "assignments:read"
    );
    const { service, repositoryCalls } = createService({
      requireCapability: async () => {
        throw denied;
      },
    });

    await expect(
      service.listAssignmentHistory(
        { tenant_id: "tenant-1", user_id: "actor-1" },
        "assignment-1"
      )
    ).rejects.toThrow(CapabilityDeniedError);

    expect(repositoryCalls.listHistory).toHaveLength(0);
  });

  it("rejects empty tenant for listAssignmentHistory", async () => {
    const { service } = createService();

    await expect(
      service.listAssignmentHistory(
        { tenant_id: "   ", user_id: "actor-1" },
        "assignment-1"
      )
    ).rejects.toThrow("Cannot list assignment history without tenant context.");
  });

  it("rejects blank assignment id for listAssignmentHistory", async () => {
    const { service } = createService();

    await expect(
      service.listAssignmentHistory(
        { tenant_id: "tenant-1", user_id: "actor-1" },
        "   "
      )
    ).rejects.toThrow("Assignment id is required for history lookup.");
  });

  it("rejects tenant override payloads", async () => {
    const { service, repositoryCalls } = createService();

    const result = await service.createAssignment(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        maquina_id: "machine-1",
        proyecto_id: "project-1",
        operador_id: "user-1",
        tarifa_aplicada: 150,
        tenant_id: "tenant-2",
      } as CreateAssignmentInput
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
    expect(repositoryCalls.create).toHaveLength(0);
  });
});
