import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseFuelTypeCatalogRepository } from "./SupabaseFuelTypeCatalogRepository";

interface RpcCall {
  readonly functionName: string;
  readonly args: unknown;
}

interface QueryCall {
  readonly operation: string;
  readonly details: string;
}

function createMockQuery<T>(
  response: {
    readonly data: T;
    readonly error: null;
    readonly count?: number | null;
  },
  calls: QueryCall[],
  table: string,
  onInsertOrUpdate?: (values: unknown) => void
) {
  const query = {
    data: response.data,
    error: response.error,
    count: response.count ?? null,
    select: (columns: string) => {
      calls.push({ operation: "select", details: `${table}:${columns}` });
      return query;
    },
    eq: (column: string, value: unknown) => {
      calls.push({
        operation: "eq",
        details: `${table}:${column}=${String(value)}`,
      });
      return query;
    },
    order: (column: string, _options: unknown) => {
      calls.push({
        operation: "order",
        details: `${table}:${column}`,
      });
      return query;
    },
    insert: (values: unknown) => {
      calls.push({ operation: "insert", details: table });
      onInsertOrUpdate?.(values);
      return query;
    },
    update: (values: unknown, options?: unknown) => {
      calls.push({ operation: "update", details: table });
      if (options) {
        calls.push({
          operation: "updateOptions",
          details: JSON.stringify(options),
        });
      }
      onInsertOrUpdate?.(values);
      return query;
    },
    single: async () => ({ data: response.data, error: response.error }),
  };

  return query;
}

describe("SupabaseFuelTypeCatalogRepository", () => {
  it("lists only active fuel types for the requested tenant ordered by nombre", async () => {
    const calls: QueryCall[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("tipos_combustible");
        return createMockQuery(
          {
            data: [
              {
                id: "fuel-type-id-1",
                tenant_id: "tenant-1",
                nombre: "Gasolina 95",
                estado: "activo" as const,
                created_at: "2026-06-17T00:00:00.000Z",
                updated_at: "2026-06-17T00:00:00.000Z",
              },
            ],
            error: null,
          },
          calls,
          table
        );
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseFuelTypeCatalogRepository(client);
    const result = await repository.listActive({ tenantId: "tenant-1" });

    expect(result).toHaveLength(1);
    expect(calls).toContainEqual({
      operation: "eq",
      details: "tipos_combustible:tenant_id=tenant-1",
    });
    expect(calls).toContainEqual({
      operation: "eq",
      details: "tipos_combustible:estado=activo",
    });
    expect(calls).toContainEqual({
      operation: "order",
      details: "tipos_combustible:nombre",
    });
  });

  it("creates fuel types through one atomic RPC that carries audit context", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: "fuel-type-id-1", error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseFuelTypeCatalogRepository(client);
    const result = await repository.create({
      tenantId: "tenant-1",
      actorId: "actor-1",
      auditSource: "web",
      nombre: "Gasolina 95",
    });

    expect(result).toEqual({ id: "fuel-type-id-1" });
    expect(rpcCalls).toEqual([
      {
        functionName: "create_tipo_combustible",
        args: {
          p_nombre: "Gasolina 95",
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
        },
      },
    ]);
  });

  it("updates and hides fuel types through one atomic RPC per mutation", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: true, error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseFuelTypeCatalogRepository(client);
    const updateResult = await repository.update({
      tenantId: "tenant-1",
      fuelTypeId: "fuel-type-id-1",
      actorId: "actor-1",
      auditSource: "web",
      nombre: "Gasolina 98",
    });
    const hideResult = await repository.hide({
      tenantId: "tenant-1",
      fuelTypeId: "fuel-type-id-1",
      actorId: "actor-1",
      auditSource: "web",
    });

    expect(updateResult).toBe(true);
    expect(hideResult).toBe(true);
    expect(rpcCalls).toEqual([
      {
        functionName: "update_tipo_combustible",
        args: {
          p_nombre: "Gasolina 98",
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_fuel_type_id: "fuel-type-id-1",
        },
      },
      {
        functionName: "hide_tipo_combustible",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_fuel_type_id: "fuel-type-id-1",
        },
      },
    ]);
  });

  it("returns false when update and hide affect no tenant fuel type", async () => {
    const client = {
      rpc: async () => ({ data: false, error: null }),
    } as unknown as SupabaseClient;

    const repository = new SupabaseFuelTypeCatalogRepository(client);

    await expect(
      repository.update({
        tenantId: "tenant-1",
        fuelTypeId: "missing-fuel-type",
        actorId: "actor-1",
        auditSource: "web",
        nombre: "Gasolina",
      })
    ).resolves.toBe(false);
    await expect(
      repository.hide({
        tenantId: "tenant-1",
        fuelTypeId: "cross-tenant-fuel-type",
        actorId: "actor-1",
        auditSource: "web",
      })
    ).resolves.toBe(false);
  });

  it("preserves supabase error code when RPC fails", async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: "duplicate key value", code: "23505" },
      }),
    } as unknown as SupabaseClient;

    const repository = new SupabaseFuelTypeCatalogRepository(client);

    await expect(
      repository.create({
        tenantId: "tenant-1",
        actorId: "actor-1",
        auditSource: "web",
        nombre: "Gasolina 95",
      })
    ).rejects.toThrow("duplicate key value");
  });
});
