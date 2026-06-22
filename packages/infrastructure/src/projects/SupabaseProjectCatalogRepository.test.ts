import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseProjectCatalogRepository } from "./SupabaseProjectCatalogRepository";

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
    neq: (column: string, value: unknown) => {
      calls.push({
        operation: "neq",
        details: `${table}:${column}!=${String(value)}`,
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

describe("SupabaseProjectCatalogRepository", () => {
  it("lists visible projects for the requested tenant and excludes hidden", async () => {
    const calls: QueryCall[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("proyectos");
        return createMockQuery(
          {
            data: [
              {
                id: "project-id-1",
                tenant_id: "tenant-1",
                nombre: "Proyecto Uno",
                cliente_id: "client-id-1",
                ubicacion: "Plaza",
                fecha_inicio: "2026-06-17",
                fecha_finalizacion: null,
                forma_cobro: "monto_fijo",
                monto_fijo: 1500,
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

    const repository = new SupabaseProjectCatalogRepository(client);
    const result = await repository.listVisible({ tenantId: "tenant-1" });

    expect(result).toHaveLength(1);
    expect(calls).toContainEqual({ operation: "eq", details: "proyectos:tenant_id=tenant-1" });
    expect(calls).toContainEqual({
      operation: "neq",
      details: "proyectos:estado!=oculto",
    });
  });

  it("creates projects through one atomic RPC with audit context", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: "project-id-1", error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseProjectCatalogRepository(client);
    const result = await repository.create({
      tenantId: "tenant-1",
      actorId: "actor-1",
      auditSource: "web",
      nombre: "Proyecto Uno",
      cliente_id: "client-id-1",
      ubicacion: "Plaza",
      fecha_inicio: "2026-06-01",
      forma_cobro: "monto_fijo",
      monto_fijo: 2500,
    });

    expect(result).toEqual({ id: "project-id-1" });
    expect(rpcCalls).toEqual([
      {
        functionName: "create_proyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_nombre: "Proyecto Uno",
          p_cliente_id: "client-id-1",
          p_ubicacion: "Plaza",
          p_fecha_inicio: "2026-06-01",
          p_forma_cobro: "monto_fijo",
          p_monto_fijo: 2500,
        },
      },
    ]);
  });

  it("updates lifecycle states through dedicated RPCs", async () => {
    const rpcCalls: RpcCall[] = [];
    const client = {
      rpc: async (functionName: string, args: unknown) => {
        rpcCalls.push({ functionName, args });
        return { data: true, error: null };
      },
    } as unknown as SupabaseClient;

    const repository = new SupabaseProjectCatalogRepository(client);
    const updateResult = await repository.update({
      tenantId: "tenant-1",
      projectId: "project-id-1",
      actorId: "actor-1",
      auditSource: "web",
      nombre: "Proyecto Editado",
      cliente_id: "client-id-1",
      ubicacion: "Nuevo sitio",
      fecha_inicio: "2026-06-01",
      forma_cobro: "por_horas",
      fecha_finalizacion: "2026-06-17",
    });
    const pauseResult = await repository.pause({
      tenantId: "tenant-1",
      projectId: "project-id-1",
      actorId: "actor-1",
      auditSource: "web",
      force: true,
      reason: "Cierre temporal",
    });
    const finishResult = await repository.finish({
      tenantId: "tenant-1",
      projectId: "project-id-1",
      actorId: "actor-1",
      auditSource: "web",
      force: false,
    });
    const reopenResult = await repository.reopen({
      tenantId: "tenant-1",
      projectId: "project-id-1",
      actorId: "actor-1",
      auditSource: "web",
      target_estado: "pausado",
    });
    const hideResult = await repository.hide({
      tenantId: "tenant-1",
      projectId: "project-id-1",
      actorId: "actor-1",
      auditSource: "web",
    });

    expect(updateResult).toBe(true);
    expect(pauseResult).toBe(true);
    expect(finishResult).toBe(true);
    expect(reopenResult).toBe(true);
    expect(hideResult).toBe(true);
    expect(rpcCalls).toEqual([
      {
        functionName: "update_proyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_project_id: "project-id-1",
          p_nombre: "Proyecto Editado",
          p_cliente_id: "client-id-1",
          p_ubicacion: "Nuevo sitio",
          p_fecha_inicio: "2026-06-01",
          p_forma_cobro: "por_horas",
          p_monto_fijo: null,
          p_fecha_finalizacion: "2026-06-17",
        },
      },
      {
        functionName: "pause_proyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_project_id: "project-id-1",
          p_force: true,
          p_reason: "Cierre temporal",
        },
      },
      {
        functionName: "finish_proyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_project_id: "project-id-1",
          p_force: false,
          p_reason: null,
        },
      },
      {
        functionName: "reopen_proyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_project_id: "project-id-1",
          p_target_estado: "pausado",
        },
      },
      {
        functionName: "hide_proyecto",
        args: {
          p_actor_id: "actor-1",
          p_audit_source: "web",
          p_tenant_id: "tenant-1",
          p_project_id: "project-id-1",
        },
      },
    ]);
  });

  it("returns false when mutations affect no tenant project", async () => {
    const client = {
      rpc: async () => ({ data: false, error: null }),
    } as unknown as SupabaseClient;

    const repository = new SupabaseProjectCatalogRepository(client);

    await expect(
      repository.update({
        tenantId: "tenant-1",
        projectId: "missing-project",
        actorId: "actor-1",
        auditSource: "web",
        nombre: "Proyecto",
        cliente_id: "client-id-1",
        ubicacion: "Plaza",
        fecha_inicio: "2026-06-01",
        forma_cobro: "por_dia",
      })
    ).resolves.toBe(false);

    await expect(
      repository.pause({
        tenantId: "tenant-1",
        projectId: "missing-project",
        actorId: "actor-1",
        auditSource: "web",
        force: false,
      })
    ).resolves.toBe(false);
    await expect(
      repository.hide({
        tenantId: "tenant-1",
        projectId: "missing-project",
        actorId: "actor-1",
        auditSource: "web",
      })
    ).resolves.toBe(false);
  });
});
