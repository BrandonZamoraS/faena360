import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { handleValidationConfigGet } from "./handler";

process.env.WEBHOOK_WHATSAPP_SECRET = "test-whatsapp-secret";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function buildSignedRequest(
  tipo: string,
  headers: Record<string, string> = {},
  timestamp = Date.now().toString()
) {
  const rawBody = "";
  const signature = createHmac("sha256", process.env.WEBHOOK_WHATSAPP_SECRET!)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return new NextRequest(
    `http://localhost/api/config/validacion?tipo=${encodeURIComponent(tipo)}`,
    {
      method: "GET",
      headers: {
        "X-Faena-Timestamp": timestamp,
        "X-Faena-Signature": signature,
        "X-Faena-Tenant-Id": TENANT_ID,
        "X-Faena-User-Id": USER_ID,
        ...headers,
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
      buildSignedRequest("gasto", { "X-Faena-Tenant-Id": "" })
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
      buildSignedRequest("gasto", { "X-Faena-Tenant-Id": "tenant-1" })
    );
    const invalidUserResponse = await handleValidationConfigGet(
      buildSignedRequest("gasto", { "X-Faena-User-Id": "user-1" })
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
      buildSignedRequest("   "),
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
      buildSignedRequest("gasto"),
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
      buildSignedRequest("inicio_jornada"),
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
      buildSignedRequest("gasto"),
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
});
