import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { handleWhatsappIdentifyPost } from "./handler";

process.env.WEBHOOK_WHATSAPP_SECRET = "test-whatsapp-secret";

function buildSignedRequest(
  body: Record<string, unknown>,
  timestamp = Date.now().toString()
) {
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha256", process.env.WEBHOOK_WHATSAPP_SECRET!)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return new NextRequest("http://localhost/api/webhooks/whatsapp/identify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Faena-Timestamp": timestamp,
      "X-Faena-Signature": signature,
    },
    body: rawBody,
  });
}

describe("POST /api/webhooks/whatsapp/identify", () => {
  it("rejects invalid signatures", async () => {
    const request = new NextRequest(
      "http://localhost/api/webhooks/whatsapp/identify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Faena-Timestamp": Date.now().toString(),
          "X-Faena-Signature": "deadbeef",
        },
        body: JSON.stringify({ phone: "+54 9 11 1234 5678" }),
      }
    );

    const response = await handleWhatsappIdentifyPost(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      userIdentified: false,
      errorCode: "WEBHOOK_NO_AUTORIZADO",
    });
  });

  it("rejects stale timestamps", async () => {
    const response = await handleWhatsappIdentifyPost(
      buildSignedRequest(
        {
          phone: "+54 9 11 1234 5678",
          text: "Hola",
          timestamp: "2026-06-22T10:00:00Z",
          provider: "meta",
          provider_message_id: "wamid.123",
        },
        (Date.now() - 301_000).toString()
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      userIdentified: false,
      errorCode: "WEBHOOK_NO_AUTORIZADO",
    });
  });

  it("maps missing phone to USUARIO_NO_REGISTRADO", async () => {
    const identify = vi.fn();

    const response = await handleWhatsappIdentifyPost(
      buildSignedRequest({
        text: "Hola",
        timestamp: "2026-06-22T10:00:00Z",
        provider: "meta",
        provider_message_id: "wamid.123",
      }),
      { service: { identify } }
    );

    expect(response.status).toBe(404);
    expect(identify).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      userIdentified: false,
      errorCode: "USUARIO_NO_REGISTRADO",
    });
  });

  it("maps representative business denials to controlled 403 responses", async () => {
    const response = await handleWhatsappIdentifyPost(
      buildSignedRequest({
        phone: "+54 9 11 1234 5678",
        text: "Hola",
        timestamp: "2026-06-22T10:00:00Z",
        provider: "meta",
        provider_message_id: "wamid.123",
      }),
      {
        service: {
          identify: vi
            .fn()
            .mockResolvedValue({ ok: false, errorCode: "PERMISO_DENEGADO" }),
        },
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      userIdentified: false,
      errorCode: "PERMISO_DENEGADO",
      message: "Controlled identity rejection.",
    });
  });

  it("maps successful identification", async () => {
    const identify = vi.fn().mockResolvedValue({
      ok: true,
      user: {
        userId: "user-1",
        userName: "Juan Pérez",
        tenantId: "tenant-1",
        roles: ["operador"],
        capabilities: ["whatsapp.channel.access"],
      },
    });

    const response = await handleWhatsappIdentifyPost(
      buildSignedRequest({
        phone: "+54 9 11 1234 5678",
        text: "Hola",
        timestamp: "2026-06-22T10:00:00Z",
        provider: "meta",
        provider_message_id: "wamid.123",
      }),
      { service: { identify } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userIdentified: true,
      userId: "user-1",
      userName: "Juan Pérez",
      tenantId: "tenant-1",
      roles: ["operador"],
      capabilities: ["whatsapp.channel.access"],
    });
  });

  it("returns a controlled 500 when the service throws unexpectedly", async () => {
    const response = await handleWhatsappIdentifyPost(
      buildSignedRequest({
        phone: "+54 9 11 1234 5678",
        text: "Hola",
        timestamp: "2026-06-22T10:00:00Z",
        provider: "meta",
        provider_message_id: "wamid.123",
      }),
      {
        service: {
          identify: vi.fn().mockRejectedValue(new Error("db exploded")),
        },
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      userIdentified: false,
      errorCode: "ERROR_INTERNO",
      message: "Unexpected identity failure.",
    });
  });
});
