import { describe, expect, it } from "vitest";
import type {
  FuelTypeCatalogRepository,
  FuelTypeCatalogSummary,
  CreateFuelTypeInput,
  AuditSource,
} from "@faena360/domain";

import {
  createFuelTypeCatalogService,
  type FuelTypeCatalogServiceDependencies,
} from "./fuel-type-catalog";
import { CapabilityDeniedError } from "../auth/effective-capabilities";

interface MockCalls {
  readonly requireCapability: string[];
  readonly requireCapabilityScopes: Array<{
    readonly tenantId: string;
    readonly userId: string;
  }>;
  readonly listActiveCalls: string[];
  readonly createCalls: Array<{
    readonly tenantId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly nombre: string;
  }>;
  readonly updateCalls: Array<{
    readonly tenantId: string;
    readonly fuelTypeId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
    readonly nombre: string;
  }>;
  readonly hideCalls: Array<{
    readonly tenantId: string;
    readonly fuelTypeId: string;
    readonly actorId: string;
    readonly auditSource: AuditSource;
  }>;
}

type FuelTypeCatalogOverrides = {
  readonly repository?: Partial<FuelTypeCatalogRepository>;
  readonly capabilityChecker?: {
    readonly requireCapability?: FuelTypeCatalogServiceDependencies["capabilityChecker"]["requireCapability"];
  };
};

function createCallsTracker(): MockCalls {
  return {
    requireCapability: [],
    requireCapabilityScopes: [],
    listActiveCalls: [],
    createCalls: [],
    updateCalls: [],
    hideCalls: [],
  };
}

function createFuelTypeCatalogServiceWithMocks(
  overrides?: FuelTypeCatalogOverrides & { readonly calls?: MockCalls }
) {
  const calls = overrides?.calls ?? createCallsTracker();

  const service = createFuelTypeCatalogService({
    repository: {
      listActive: async ({ tenantId }) => {
        calls.listActiveCalls.push(tenantId);

        return [
          {
            id: "fuel-type-id-1",
            tenant_id: tenantId,
            nombre: "Gasolina 95",
            estado: "activo",
            created_at: "2026-06-17T00:00:00.000Z",
            updated_at: "2026-06-17T00:00:00.000Z",
          } satisfies FuelTypeCatalogSummary,
        ];
      },
      create: async (input) => {
        calls.createCalls.push(input);
        return { id: "fuel-type-id-1" };
      },
      update: async (input) => {
        calls.updateCalls.push(input);
        return true;
      },
      hide: async (input) => {
        calls.hideCalls.push(input);
        return true;
      },
      ...overrides?.repository,
    },
    capabilityChecker: {
      requireCapability: async (scope, capabilityCode) => {
        calls.requireCapability.push(capabilityCode);
        calls.requireCapabilityScopes.push(scope);
        return {} as unknown as never;
      },
      ...overrides?.capabilityChecker,
    },
  });

  return { service, calls };
}

describe("fuel type catalog service", () => {
  it("lists active fuel types for the session tenant after fuel_types:read", async () => {
    const { service, calls } = createFuelTypeCatalogServiceWithMocks();

    const result = await service.listActiveFuelTypes({
      tenant_id: " tenant-1 ",
      user_id: "actor-1",
    });

    expect(calls.requireCapability).toEqual(["fuel_types:read"]);
    expect(calls.requireCapabilityScopes[0]).toEqual({
      tenantId: "tenant-1",
      userId: "actor-1",
    });
    expect(calls.listActiveCalls).toEqual(["tenant-1"]);
    expect(result[0]?.tenant_id).toBe("tenant-1");
    expect(result[0]?.estado).toBe("activo");
  });

  it("rejects create before persistence when fuel_types:create is denied", async () => {
    const calls = createCallsTracker();
    const { service } = createFuelTypeCatalogServiceWithMocks({
      calls,
      capabilityChecker: {
        requireCapability: async (scope, capabilityCode) => {
          calls.requireCapability.push(capabilityCode);
          calls.requireCapabilityScopes.push(scope);
          throw new CapabilityDeniedError(
            scope.userId,
            scope.tenantId,
            capabilityCode
          );
        },
      },
    });

    const result = await service.createFuelType(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "Gasolina 95" }
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
    expect(calls.createCalls).toHaveLength(0);
  });

  it("normalizes create input and always uses the session tenant", async () => {
    const { service, calls } = createFuelTypeCatalogServiceWithMocks();

    const result = await service.createFuelType(
      { tenant_id: " tenant-2 ", user_id: "actor-2" },
      {
        nombre: "  Gasolina 95  ",
      }
    );

    expect(result).toEqual({ ok: true, fuelTypeId: "fuel-type-id-1" });
    expect(calls.createCalls[0]).toEqual({
      tenantId: "tenant-2",
      actorId: "actor-2",
      auditSource: "web",
      nombre: "Gasolina 95",
    });
  });

  it("rejects empty fuel type names and tenant override payloads", async () => {
    const { service, calls } = createFuelTypeCatalogServiceWithMocks();

    const emptyNameResult = await service.createFuelType(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "   " }
    );
    const spoofedTenantResult = await service.createFuelType(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "Gasolina", tenant_id: "tenant-2" } as CreateFuelTypeInput
    );

    expect(emptyNameResult).toEqual({ ok: false, code: "missing_nombre" });
    expect(spoofedTenantResult).toEqual({
      ok: false,
      code: "capability_denied",
    });
    expect(calls.createCalls).toHaveLength(0);
  });

  it("returns duplicate_active_name when repository throws unique violation", async () => {
    const { service } = createFuelTypeCatalogServiceWithMocks({
      repository: {
        create: async () => {
          const error = new Error(
            "duplicate key value violates unique constraint"
          ) as unknown as { code: string };
          error.code = "23505";
          throw error;
        },
      },
    });

    const createResult = await service.createFuelType(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "Gasolina 95" }
    );

    expect(createResult).toEqual({ ok: false, code: "duplicate_active_name" });
  });

  it("updates and hides fuel types through tenant-scoped repository calls", async () => {
    const { service, calls } = createFuelTypeCatalogServiceWithMocks();

    const updateResult = await service.updateFuelType(
      { tenant_id: " tenant-3 ", user_id: "actor-3" },
      {
        fuelTypeId: " fuel-type-id-3 ",
        nombre: "  Diesel  ",
      }
    );
    const hideResult = await service.hideFuelType(
      { tenant_id: " tenant-3 ", user_id: "actor-3" },
      { fuelTypeId: " fuel-type-id-3 " }
    );

    expect(updateResult).toEqual({ ok: true });
    expect(hideResult).toEqual({ ok: true });
    expect(calls.requireCapability).toEqual([
      "fuel_types:update",
      "fuel_types:update",
    ]);
    expect(calls.updateCalls[0]).toMatchObject({
      tenantId: "tenant-3",
      fuelTypeId: "fuel-type-id-3",
      actorId: "actor-3",
      auditSource: "web",
      nombre: "Diesel",
    });
    expect(calls.hideCalls[0]).toEqual({
      tenantId: "tenant-3",
      fuelTypeId: "fuel-type-id-3",
      actorId: "actor-3",
      auditSource: "web",
    });
  });

  it("returns missing_fuel_type when update or hide does not affect a tenant fuel type", async () => {
    const { service } = createFuelTypeCatalogServiceWithMocks({
      repository: {
        update: async () => false,
        hide: async () => false,
      },
    });

    const updateResult = await service.updateFuelType(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { fuelTypeId: "missing-fuel-type", nombre: "Gasolina" }
    );
    const hideResult = await service.hideFuelType(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { fuelTypeId: "cross-tenant-fuel-type" }
    );

    expect(updateResult).toEqual({ ok: false, code: "missing_fuel_type" });
    expect(hideResult).toEqual({ ok: false, code: "missing_fuel_type" });
  });
});
