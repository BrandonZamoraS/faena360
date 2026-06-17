import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseClientCatalogRepository } from "./SupabaseClientCatalogRepository";

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

describe("SupabaseClientCatalogRepository", () => {
  it("lists only active clients for the requested tenant", async () => {
    const calls: QueryCall[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("clientes");
        return createMockQuery(
          {
            data: [
              {
                id: "client-id-1",
                tenant_id: "tenant-1",
                nombre: "Cliente Uno",
                telefono: null,
                correo: null,
                identificacion: null,
                direccion: null,
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

    const repository = new SupabaseClientCatalogRepository(client);
    const result = await repository.listActive({ tenantId: "tenant-1" });

    expect(result).toHaveLength(1);
    expect(calls).toContainEqual({
      operation: "eq",
      details: "clientes:tenant_id=tenant-1",
    });
    expect(calls).toContainEqual({
      operation: "eq",
      details: "clientes:estado=activo",
    });
  });

  it("creates clients with session tenant and activo state", async () => {
    const calls: QueryCall[] = [];
    let insertPayload: unknown;
    const client = {
      from: (table: string) =>
        createMockQuery(
          { data: { id: "client-id-1" }, error: null },
          calls,
          table,
          (values) => {
            insertPayload = values;
          }
        ),
    } as unknown as SupabaseClient;

    const repository = new SupabaseClientCatalogRepository(client);
    const result = await repository.create({
      tenantId: "tenant-1",
      nombre: "Cliente Uno",
      telefono: "+54 11 5555-4444",
    });

    expect(result).toEqual({ id: "client-id-1" });
    expect(insertPayload).toMatchObject({
      tenant_id: "tenant-1",
      nombre: "Cliente Uno",
      telefono: "+54 11 5555-4444",
      estado: "activo",
    });
  });

  it("updates and hides clients with tenant and client filters", async () => {
    const calls: QueryCall[] = [];
    const payloads: unknown[] = [];
    const client = {
      from: (table: string) =>
        createMockQuery(
          { data: null, error: null, count: 1 },
          calls,
          table,
          (values) => {
            payloads.push(values);
          }
        ),
    } as unknown as SupabaseClient;

    const repository = new SupabaseClientCatalogRepository(client);
    const updateResult = await repository.update({
      tenantId: "tenant-1",
      clientId: "client-id-1",
      nombre: "Cliente Editado",
      correo: "cliente@example.com",
    });
    const hideResult = await repository.hide({
      tenantId: "tenant-1",
      clientId: "client-id-1",
    });

    expect(updateResult).toBe(true);
    expect(hideResult).toBe(true);
    expect(payloads).toEqual([
      {
        nombre: "Cliente Editado",
        telefono: null,
        correo: "cliente@example.com",
        identificacion: null,
        direccion: null,
      },
      { estado: "oculto" },
    ]);
    expect(calls).toContainEqual({
      operation: "eq",
      details: "clientes:tenant_id=tenant-1",
    });
    expect(calls).toContainEqual({
      operation: "eq",
      details: "clientes:id=client-id-1",
    });
    expect(calls).toContainEqual({
      operation: "updateOptions",
      details: '{"count":"exact"}',
    });
  });

  it("returns false when update and hide affect no tenant client", async () => {
    const client = {
      from: (table: string) =>
        createMockQuery({ data: null, error: null, count: 0 }, [], table),
    } as unknown as SupabaseClient;

    const repository = new SupabaseClientCatalogRepository(client);

    await expect(
      repository.update({
        tenantId: "tenant-1",
        clientId: "missing-client",
        nombre: "Cliente",
      })
    ).resolves.toBe(false);
    await expect(
      repository.hide({ tenantId: "tenant-1", clientId: "cross-tenant-client" })
    ).resolves.toBe(false);
  });
});
