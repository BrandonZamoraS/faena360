import { describe, expect, it } from "vitest";
import type {
  ClientCatalogRepository,
  ClientCatalogSummary,
  CreateClientInput,
} from "@faena360/domain";

import {
  createClientCatalogService,
  type ClientCatalogServiceDependencies,
} from "./client-catalog";
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
    readonly nombre: string;
    readonly telefono?: string;
    readonly correo?: string;
    readonly identificacion?: string;
    readonly direccion?: string;
  }>;
  readonly updateCalls: Array<{
    readonly tenantId: string;
    readonly clientId: string;
    readonly nombre: string;
    readonly telefono?: string;
    readonly correo?: string;
    readonly identificacion?: string;
    readonly direccion?: string;
  }>;
  readonly hideCalls: Array<{
    readonly tenantId: string;
    readonly clientId: string;
  }>;
}

type ClientCatalogOverrides = {
  readonly repository?: Partial<ClientCatalogRepository>;
  readonly capabilityChecker?: {
    readonly requireCapability?: ClientCatalogServiceDependencies["capabilityChecker"]["requireCapability"];
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

function createClientCatalogServiceWithMocks(
  overrides?: ClientCatalogOverrides & { readonly calls?: MockCalls }
) {
  const calls = overrides?.calls ?? createCallsTracker();

  const service = createClientCatalogService({
    repository: {
      listActive: async ({ tenantId }) => {
        calls.listActiveCalls.push(tenantId);

        return [
          {
            id: "client-id-1",
            tenant_id: tenantId,
            nombre: "Cliente Uno",
            telefono: null,
            correo: null,
            identificacion: null,
            direccion: null,
            estado: "activo",
            created_at: "2026-06-17T00:00:00.000Z",
            updated_at: "2026-06-17T00:00:00.000Z",
          } satisfies ClientCatalogSummary,
        ];
      },
      create: async (input) => {
        calls.createCalls.push(input);
        return { id: "client-id-1" };
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

describe("client catalog service", () => {
  it("lists active clients for the session tenant after clients:read", async () => {
    const { service, calls } = createClientCatalogServiceWithMocks();

    const result = await service.listActiveClients({
      tenant_id: " tenant-1 ",
      user_id: "actor-1",
    });

    expect(calls.requireCapability).toEqual(["clients:read"]);
    expect(calls.requireCapabilityScopes[0]).toEqual({
      tenantId: "tenant-1",
      userId: "actor-1",
    });
    expect(calls.listActiveCalls).toEqual(["tenant-1"]);
    expect(result[0]?.tenant_id).toBe("tenant-1");
    expect(result[0]?.estado).toBe("activo");
  });

  it("rejects create before persistence when clients:create is denied", async () => {
    const calls = createCallsTracker();
    const { service } = createClientCatalogServiceWithMocks({
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

    const result = await service.createClient(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "Cliente Uno" }
    );

    expect(result).toEqual({ ok: false, code: "capability_denied" });
    expect(calls.createCalls).toHaveLength(0);
  });

  it("normalizes create input and always uses the session tenant", async () => {
    const { service, calls } = createClientCatalogServiceWithMocks();

    const result = await service.createClient(
      { tenant_id: " tenant-2 ", user_id: "actor-2" },
      {
        nombre: "  Cliente Dos  ",
        telefono: "  +54 11 5555-4444  ",
        correo: "  CONTACTO@CLIENTE.COM  ",
        identificacion: "  CUIT-123  ",
        direccion: "  Calle 123  ",
      }
    );

    expect(result).toEqual({ ok: true, clientId: "client-id-1" });
    expect(calls.createCalls[0]).toEqual({
      tenantId: "tenant-2",
      nombre: "Cliente Dos",
      telefono: "+54 11 5555-4444",
      correo: "contacto@cliente.com",
      identificacion: "CUIT-123",
      direccion: "Calle 123",
    });
  });

  it("rejects empty client names and tenant override payloads", async () => {
    const { service, calls } = createClientCatalogServiceWithMocks();

    const emptyNameResult = await service.createClient(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "   " }
    );
    const spoofedTenantResult = await service.createClient(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { nombre: "Cliente", tenant_id: "tenant-2" } as CreateClientInput
    );

    expect(emptyNameResult).toEqual({ ok: false, code: "missing_nombre" });
    expect(spoofedTenantResult).toEqual({
      ok: false,
      code: "capability_denied",
    });
    expect(calls.createCalls).toHaveLength(0);
  });

  it("updates and hides clients through tenant-scoped repository calls", async () => {
    const { service, calls } = createClientCatalogServiceWithMocks();

    const updateResult = await service.updateClient(
      { tenant_id: " tenant-3 ", user_id: "actor-3" },
      {
        clientId: " client-id-3 ",
        nombre: "  Cliente Tres  ",
      }
    );
    const hideResult = await service.hideClient(
      { tenant_id: " tenant-3 ", user_id: "actor-3" },
      { clientId: " client-id-3 " }
    );

    expect(updateResult).toEqual({ ok: true });
    expect(hideResult).toEqual({ ok: true });
    expect(calls.requireCapability).toEqual([
      "clients:update",
      "clients:update",
    ]);
    expect(calls.updateCalls[0]).toMatchObject({
      tenantId: "tenant-3",
      clientId: "client-id-3",
      nombre: "Cliente Tres",
    });
    expect(calls.hideCalls[0]).toEqual({
      tenantId: "tenant-3",
      clientId: "client-id-3",
    });
  });

  it("returns missing_client when update or hide does not affect a tenant client", async () => {
    const { service } = createClientCatalogServiceWithMocks({
      repository: {
        update: async () => false,
        hide: async () => false,
      },
    });

    const updateResult = await service.updateClient(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { clientId: "missing-client", nombre: "Cliente" }
    );
    const hideResult = await service.hideClient(
      { tenant_id: "tenant-1", user_id: "actor-1" },
      { clientId: "cross-tenant-client" }
    );

    expect(updateResult).toEqual({ ok: false, code: "missing_client" });
    expect(hideResult).toEqual({ ok: false, code: "missing_client" });
  });
});
