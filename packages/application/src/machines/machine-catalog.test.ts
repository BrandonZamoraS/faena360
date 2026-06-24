import { describe, expect, it } from "vitest";

import type { CreateMachineInput } from "@faena360/domain";
import {
  createMachineCatalogService,
  type MachineCatalogServiceDependencies,
} from "./machine-catalog";
import { CapabilityDeniedError } from "../auth/effective-capabilities";

describe("machine catalog service", () => {
  function createService(overrides?: {
    repository?: Partial<MachineCatalogServiceDependencies["repository"]>;
    requireCapability?: MachineCatalogServiceDependencies["capabilityChecker"]["requireCapability"];
  }) {
    const capabilityCalls: string[] = [];
    const repositoryCalls = {
      listVisible: [] as string[],
      create: [] as Array<Record<string, unknown>>,
      update: [] as Array<Record<string, unknown>>,
      changeStatus: [] as Array<Record<string, unknown>>,
    };

    const repository = {
      listVisible: async ({ tenantId }: { tenantId: string }) => {
        repositoryCalls.listVisible.push(tenantId);
        return [
          {
            id: "machine-1",
            tenant_id: tenantId,
            codigo: "MAQ-001",
            placa: "AAA111",
            tipo: "por_tiempo" as const,
            tipo_combustible_id: "fuel-1",
            tamanio_tanque: 120,
            modo_medicion_combustible: "exacto" as const,
            nivel_inicial_combustible: 60,
            capacidad_transporte_m3: null,
            tarifa_sugerida: 150,
            estado: "activa" as const,
            created_at: "2026-06-22T00:00:00.000Z",
            updated_at: "2026-06-22T00:00:00.000Z",
          },
        ];
      },
      create: async (input: Record<string, unknown>) => {
        repositoryCalls.create.push(input);
        return { id: "machine-1" };
      },
      update: async (input: Record<string, unknown>) => {
        repositoryCalls.update.push(input);
        return true;
      },
      changeStatus: async (input: Record<string, unknown>) => {
        repositoryCalls.changeStatus.push(input);
        return true;
      },
      ...overrides?.repository,
    };

    const service = createMachineCatalogService({
      repository: repository as MachineCatalogServiceDependencies["repository"],
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

  it("lists visible machines after machines:read", async () => {
    const { service, capabilityCalls, repositoryCalls } = createService();

    const result = await service.listVisibleMachines({
      tenant_id: " tenant-1 ",
      user_id: "actor-1",
    });

    expect(capabilityCalls).toEqual(["actor-1|tenant-1|machines:read"]);
    expect(repositoryCalls.listVisible).toEqual(["tenant-1"]);
    expect(result[0]?.tenant_id).toBe("tenant-1");
  });

  it("requires machines:create before create persistence", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "machines:create"
    );
    const { service, repositoryCalls } = createService({
      requireCapability: async () => {
        throw denied;
      },
    });

    const result = await service.createMachine(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { codigo: "MAQ-001", tipo_combustible_id: "fuel-1", tamanio_tanque: 100 }
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
    expect(repositoryCalls.create).toHaveLength(0);
  });

  it("requires machines:update for edit and machines:change_status for status mutations", async () => {
    const denied = new CapabilityDeniedError(
      "actor-1",
      "tenant-1",
      "machines:update"
    );
    const { service, repositoryCalls } = createService({
      requireCapability: async (_scope, capabilityCode) => {
        if (capabilityCode !== "machines:read") {
          throw denied;
        }
      },
    });

    const updateResult = await service.updateMachine(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        machineId: "machine-1",
        codigo: "MAQ-001",
        tipo_combustible_id: "fuel-1",
        tamanio_tanque: 100,
      }
    );
    const statusResult = await service.changeMachineStatus(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { machineId: "machine-1", estado: "en_mantenimiento" }
    );
    const hideResult = await service.hideMachine(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { machineId: "machine-1" }
    );

    expect(updateResult).toEqual({ ok: false, code: "capability_denied" });
    expect(statusResult).toEqual({ ok: false, code: "capability_denied" });
    expect(hideResult).toEqual({ ok: false, code: "capability_denied" });
    expect(repositoryCalls.update).toHaveLength(0);
    expect(repositoryCalls.changeStatus).toHaveLength(0);
  });

  it("normalizes machine payloads and maps duplicate codigo", async () => {
    const { service, repositoryCalls } = createService({
      repository: {
        create: async () => {
          const error = new Error("duplicate key") as Error & { code: string };
          error.code = "23505";
          throw error;
        },
      },
    });

    const createResult = await service.createMachine(
      { tenant_id: " tenant-2 ", user_id: "actor-2" },
      {
        codigo: "  MAQ-009  ",
        placa: "  AAA999  ",
        tipo: "acarreo",
        tipo_combustible_id: " fuel-9 ",
        tamanio_tanque: 200,
        modo_medicion_combustible: "aproximado_porcentaje",
        nivel_inicial_combustible: 40,
        capacidad_transporte_m3: 12.5,
        tarifa_sugerida: 90,
      }
    );

    expect(createResult).toEqual({ ok: false, code: "duplicate_codigo" });
    expect(repositoryCalls.create).toHaveLength(0);

    const { service: okService, repositoryCalls: okRepositoryCalls } =
      createService();
    const okResult = await okService.createMachine(
      { tenant_id: " tenant-2 ", user_id: "actor-2" },
      {
        codigo: "  MAQ-010  ",
        placa: "  BBB100  ",
        tipo: "acarreo",
        tipo_combustible_id: " fuel-10 ",
        tamanio_tanque: 180,
        modo_medicion_combustible: "sin_medicion",
        capacidad_transporte_m3: 15,
      }
    );

    expect(okResult).toEqual({ ok: true, machineId: "machine-1" });
    expect(okRepositoryCalls.create[0]).toMatchObject({
      tenantId: "tenant-2",
      actorId: "actor-2",
      codigo: "MAQ-010",
      placa: "BBB100",
      tipo: "acarreo",
      tipo_combustible_id: "fuel-10",
      tamanio_tanque: 180,
      modo_medicion_combustible: "sin_medicion",
      nivel_inicial_combustible: null,
      capacidad_transporte_m3: 15,
    });
  });

  it("rejects blank codigo, blank machine ids, and tenant override payloads", async () => {
    const { service, repositoryCalls } = createService();

    const missingCodigo = await service.createMachine(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { codigo: "   ", tipo_combustible_id: "fuel-1", tamanio_tanque: 100 }
    );
    const missingMachine = await service.updateMachine(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        machineId: "   ",
        codigo: "MAQ-001",
        tipo_combustible_id: "fuel-1",
        tamanio_tanque: 100,
      }
    );
    const tenantSpoof = await service.createMachine(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      {
        codigo: "MAQ-001",
        tipo_combustible_id: "fuel-1",
        tamanio_tanque: 100,
        tenant_id: "tenant-2",
      } as CreateMachineInput
    );

    expect(missingCodigo).toEqual({ ok: false, code: "missing_codigo" });
    expect(missingMachine).toEqual({ ok: false, code: "missing_machine" });
    expect(tenantSpoof).toEqual({ ok: false, code: "capability_denied" });
    expect(repositoryCalls.create).toHaveLength(0);
    expect(repositoryCalls.update).toHaveLength(0);
  });

  it.skip("blocks tipo edits once the first operational record references maquinas", async () => {
    expect(true).toBe(false);
  });
});
