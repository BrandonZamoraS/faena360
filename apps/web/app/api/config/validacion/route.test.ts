import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { handleValidationConfigGet } from "./handler";

process.env.WEBHOOK_WHATSAPP_SECRET = "test-whatsapp-secret";

const ROUTE_PATH = "/api/config/validacion";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function buildSignedPayload(input: {
  tipo: string;
  tenantId: string;
  userId: string;
  rawBody?: string;
}) {
  return JSON.stringify({
    method: "GET",
    path: ROUTE_PATH,
    query: { tipo: input.tipo },
    headers: {
      "x-faena-tenant-id": input.tenantId,
      "x-faena-user-id": input.userId,
    },
    body: input.rawBody ?? "",
  });
}

function buildSignedRequest(input: {
  tipo: string;
  requestTipo?: string;
  tenantId?: string;
  requestTenantId?: string;
  userId?: string;
  requestUserId?: string;
  headers?: Record<string, string>;
  timestamp?: string;
}) {
  const rawBody = "";
  const signedTipo = input.tipo;
  const signedTenantId = input.tenantId ?? TENANT_ID;
  const signedUserId = input.userId ?? USER_ID;
  const requestTipo = input.requestTipo ?? signedTipo;
  const requestTenantId = input.requestTenantId ?? signedTenantId;
  const requestUserId = input.requestUserId ?? signedUserId;
  const timestamp = input.timestamp ?? Date.now().toString();
  const signature = createHmac("sha256", process.env.WEBHOOK_WHATSAPP_SECRET!)
    .update(
      `${timestamp}.${buildSignedPayload({
        tipo: signedTipo,
        tenantId: signedTenantId,
        userId: signedUserId,
        rawBody,
      })}`
    )
    .digest("hex");

  return new NextRequest(
    `http://localhost${ROUTE_PATH}?tipo=${encodeURIComponent(requestTipo)}`,
    {
      method: "GET",
      headers: {
        "X-Faena-Timestamp": timestamp,
        "X-Faena-Signature": signature,
        "X-Faena-Tenant-Id": requestTenantId,
        "X-Faena-User-Id": requestUserId,
        ...input.headers,
      },
    }
  );
}

describe("GET /api/config/validacion", () => {
  it("rejects invalid signatures", async () => {
    const response = await handleValidationConfigGet(
      new NextRequest("http://localhost/api/config/validacion?tipo=gasto", {
        method: "GET",
        headers: {
          "X-Faena-Timestamp": Date.now().toString(),
          "X-Faena-Signature": "deadbeef",
          "X-Faena-Tenant-Id": TENANT_ID,
          "X-Faena-User-Id": USER_ID,
        },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "PERMISO_DENEGADO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("rejects missing tenant or user context headers", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({ tipo: "gasto", tenantId: "", requestTenantId: "" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "TENANT_INVALIDO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("rejects malformed tenant or user context headers", async () => {
    const invalidTenantResponse = await handleValidationConfigGet(
      buildSignedRequest({
        tipo: "gasto",
        tenantId: "tenant-1",
        requestTenantId: "tenant-1",
      })
    );
    const invalidUserResponse = await handleValidationConfigGet(
      buildSignedRequest({
        tipo: "gasto",
        userId: "user-1",
        requestUserId: "user-1",
      })
    );

    expect(invalidTenantResponse.status).toBe(403);
    await expect(invalidTenantResponse.json()).resolves.toEqual({
      ok: false,
      errorCode: "TENANT_INVALIDO",
      message: "Controlled validation-config rejection.",
    });

    expect(invalidUserResponse.status).toBe(403);
    await expect(invalidUserResponse.json()).resolves.toEqual({
      ok: false,
      errorCode: "TENANT_INVALIDO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("rejects missing tipo before hitting the service", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({ tipo: "   ", requestTipo: "   " }),
      { service: { getConfig: vi.fn() } }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "TIPO_INVALIDO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("maps controlled service denials", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({ tipo: "gasto" }),
      {
        service: {
          getConfig: vi.fn().mockResolvedValue({
            ok: false,
            errorCode: "PERMISO_DENEGADO",
          }),
        },
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "PERMISO_DENEGADO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("returns the minimal tenant-aware validation contract", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({ tipo: "inicio_jornada" }),
      {
        service: {
          getConfig: vi.fn().mockResolvedValue({
            ok: true,
            config: {
              tipo: "inicio_jornada",
              tenantId: TENANT_ID,
              source: "tenant_override",
              campos: {
                maquinaId: { obligatorio: true, tipo: "uuid" },
                horometroInicial: { obligatorio: true, tipo: "number" },
              },
            },
          }),
        },
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tipo: "inicio_jornada",
      tenantId: TENANT_ID,
      source: "tenant_override",
      campos: {
        maquinaId: { obligatorio: true, tipo: "uuid" },
        horometroInicial: { obligatorio: true, tipo: "number" },
      },
    });
  });

  it("returns CONFIG_INVALIDA when the service throws unexpectedly", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({ tipo: "gasto" }),
      {
        service: {
          getConfig: vi.fn().mockRejectedValue(new Error("db exploded")),
        },
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "CONFIG_INVALIDA",
      message: "Controlled validation-config rejection.",
    });
  });

  it("rejects query tampering after signing", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({
        tipo: "gasto",
        requestTipo: "inicio_jornada",
      }),
      { service: { getConfig: vi.fn() } }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "PERMISO_DENEGADO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("rejects tenant header tampering after signing", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({
        tipo: "gasto",
        requestTenantId: "33333333-3333-4333-8333-333333333333",
      }),
      { service: { getConfig: vi.fn() } }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "PERMISO_DENEGADO",
      message: "Controlled validation-config rejection.",
    });
  });

  it("rejects user header tampering after signing", async () => {
    const response = await handleValidationConfigGet(
      buildSignedRequest({
        tipo: "gasto",
        requestUserId: "44444444-4444-4444-8444-444444444444",
      }),
      { service: { getConfig: vi.fn() } }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errorCode: "PERMISO_DENEGADO",
      message: "Controlled validation-config rejection.",
    });
  });
});
