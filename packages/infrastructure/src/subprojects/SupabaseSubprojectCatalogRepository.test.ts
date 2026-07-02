import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseSubprojectCatalogRepository } from "./SupabaseSubprojectCatalogRepository";

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
  table: string
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
    neq: (column: string, value: unknown) => {
      calls.push({
        operation: "neq",
        details: `${table}:${column}!=${String(value)}`,
      });
      return query;
    },
    not: (column: string, _operator: string, filter: string) => {
      calls.push({
        operation: "not",
        details: `${table}:${column} not.in(${filter})`,
      });
      return query;
    },
    maybeSingle: async () => ({
      data: response.data,
      error: response.error,
    }),
  };

  return query;
}

describe("SupabaseSubprojectCatalogRepository", () => {
  it("lists visible subprojects for the requested tenant and excludes hidden", async () => {
    const calls: QueryCall[] = [];
    let fromCount = 0;
    const client = {
      from: (table: string) => {
        fromCount++;
        // First call: fetch hidden project IDs (always returns empty for this test).
        if (fromCount === 1) {
          return createMockQuery(
            {
              data: [] as readonly { id: string }[],
              error: null,
            },
            calls,
            table
          );
        }
        // Second call: the actual subproject query.
        return createMockQuery(
          {
            data: [
              {
                id: "sub-id-1",
                tenant_id: "tenant-1",
                proyecto_id: "proj-id-1",
                nombre: "Fase 1",
                ubicacion: "Sector Norte",
                forma_cobro: "monto_fijo",
                monto_fijo: 500,
                estado: "activo",
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

    const repository = new SupabaseSubprojectCatalogRepository(client);
    const result = await repository.listVisible({ tenantId: "tenant-1" });

    expect(result).toHaveLength(1);
    // Verify the subproject query was issued with correct filters.
    expect(calls).toContainEqual({
      operation: "eq",
      details: "subproyectos:tenant_id=tenant-1",
    });
    expect(calls).toContainEqual({
      operation: "neq",
      details: "subproyectos:estado!=oculto",
    });
    // Verify the hidden-parents filter ran (lookup against proyectos).
    expect(calls).toContainEqual({
      operation: "eq",
      details: "proyectos:tenant_id=tenant-1",
    });
    expect(calls).toContainEqual({
      operation: "eq",
      details: "proyectos:estado=oculto",
    });
  });

  it("creates subprojects through RPC with audit context and inheritance-capable params", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: "sub-id-1", error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);
    const result = await repository.create({
      tenantId: "tenant-1",
      actorId: "actor-1",
      auditSource: "web",
      proyecto_id: "proj-id-1",
      nombre: "Fase 1",
    });

    expect(result).toEqual({ id: "sub-id-1" });
    expect(rpcCalls).toEqual([
      {
        functionName: "create_subproyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_proyecto_id: "proj-id-1",
          p_nombre: "Fase 1",
          p_ubicacion: null,
          p_forma_cobro: null,
          p_monto_fijo: null,
        },
      },
    ]);
  });

  it("passes explicit ubicacion and forma_cobro to RPC without coalescing to null", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: "sub-id-2", error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);
    await repository.create({
      tenantId: "tenant-1",
      actorId: "actor-1",
      auditSource: "web",
      proyecto_id: "proj-id-1",
      nombre: "Fase 2",
      ubicacion: "Sector Sur",
      forma_cobro: "por_horas",
    });

    expect(rpcCalls[0]?.args).toMatchObject({
      p_ubicacion: "Sector Sur",
      p_forma_cobro: "por_horas",
    });
  });

  it("mutates lifecycle states through dedicated RPCs", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: true, error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);
    const updateResult = await repository.update({
      tenantId: "tenant-1",
      subprojectId: "sub-id-1",
      actorId: "actor-1",
      auditSource: "web",
      nombre: "Fase Editada",
      ubicacion: "Nuevo Sector",
      forma_cobro: "monto_fijo",
      monto_fijo: 750,
    });
    const finishResult = await repository.finish({
      tenantId: "tenant-1",
      subprojectId: "sub-id-1",
      actorId: "actor-1",
      auditSource: "web",
      force: false,
    });
    const reopenResult = await repository.reopen({
      tenantId: "tenant-1",
      subprojectId: "sub-id-1",
      actorId: "actor-1",
      auditSource: "web",
      target_estado: "pausado",
    });
    const hideResult = await repository.hide({
      tenantId: "tenant-1",
      subprojectId: "sub-id-1",
      actorId: "actor-1",
      auditSource: "web",
    });

    expect(updateResult).toBe(true);
    expect(finishResult).toBe(true);
    expect(reopenResult).toBe(true);
    expect(hideResult).toBe(true);
    expect(rpcCalls).toEqual([
      {
        functionName: "update_subproyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_subproject_id: "sub-id-1",
          p_nombre: "Fase Editada",
          p_ubicacion: "Nuevo Sector",
          p_forma_cobro: "monto_fijo",
          p_monto_fijo: 750,
        },
      },
      {
        functionName: "finish_subproyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_subproject_id: "sub-id-1",
          p_force: false,
          p_reason: null,
          p_close_assignments: true,
        },
      },
      {
        functionName: "reopen_subproyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_subproject_id: "sub-id-1",
          p_target_estado: "pausado",
        },
      },
      {
        functionName: "hide_subproyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_subproject_id: "sub-id-1",
        },
      },
    ]);
  });

  it("returns false when mutations affect no tenant subproject", async () => {
    const client = {
      rpc: async () => ({ data: false, error: null }),
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);

    await expect(
      repository.update({
        tenantId: "tenant-1",
        subprojectId: "missing-sub",
        actorId: "actor-1",
        auditSource: "web",
        nombre: "No Existe",
      })
    ).resolves.toBe(false);

    await expect(
      repository.finish({
        tenantId: "tenant-1",
        subprojectId: "missing-sub",
        actorId: "actor-1",
        auditSource: "web",
        force: false,
      })
    ).resolves.toBe(false);

    await expect(
      repository.hide({
        tenantId: "tenant-1",
        subprojectId: "missing-sub",
        actorId: "actor-1",
        auditSource: "web",
      })
    ).resolves.toBe(false);
  });

  it("throws on RPC error for mutations", async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: "parent project is finalized" },
      }),
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);

    await expect(
      repository.reopen({
        tenantId: "tenant-1",
        subprojectId: "sub-id-1",
        actorId: "actor-1",
        auditSource: "web",
        target_estado: "activo",
      })
    ).rejects.toThrow("parent project is finalized");
  });

  it("getParentFixedAmount returns null when parent has no monto_fijo", async () => {
    const calls: QueryCall[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("proyectos");
        return createMockQuery(
          {
            data: null,
            error: null,
          },
          calls,
          table
        );
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);
    const result = await repository.getParentFixedAmount(
      "tenant-1",
      "proj-id-1"
    );

    expect(result).toBeNull();
    expect(calls).toContainEqual({
      operation: "eq",
      details: "proyectos:tenant_id=tenant-1",
    });
    expect(calls).toContainEqual({
      operation: "eq",
      details: "proyectos:id=proj-id-1",
    });
  });

  it("getParentFixedAmount returns monto_fijo when parent is monto_fijo type", async () => {
    const client = {
      from: () =>
        createMockQuery(
          {
            data: { monto_fijo: 1500, forma_cobro: "monto_fijo" },
            error: null,
          },
          [],
          "proyectos"
        ),
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);
    const result = await repository.getParentFixedAmount(
      "tenant-1",
      "proj-id-2"
    );

    expect(result).toBe(1500);
  });

  it("getSubprojectFixedAmountSum excludes optional subproject id", async () => {
    const calls: QueryCall[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("subproyectos");
        return createMockQuery(
          {
            data: [
              { monto_fijo: 500 },
              { monto_fijo: 300 },
              { monto_fijo: null },
            ],
            error: null,
          },
          calls,
          table
        );
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseSubprojectCatalogRepository(client);
    const result = await repository.getSubprojectFixedAmountSum(
      "tenant-1",
      "proj-id-1",
      "exclude-me"
    );

    expect(result).toBe(800);
    expect(calls).toContainEqual({
      operation: "neq",
      details: "subproyectos:id!=exclude-me",
    });
  });
});
