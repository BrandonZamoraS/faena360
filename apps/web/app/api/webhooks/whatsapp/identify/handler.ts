import { NextRequest, NextResponse } from "next/server";
import {
  type WhatsappIdentifyService,
  WhatsappIdentifyServiceImpl,
} from "@faena360/application";
import { SupabaseWhatsappIdentityRepository } from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../../../lib/supabase";
import { verifyWhatsappWebhookSignature } from "../../../../../lib/webhooks/hmac";

const REQUIRED_CAPABILITY = "whatsapp.channel.access";

export type WhatsappIdentifyRouteDependencies = {
  service?: WhatsappIdentifyService;
  verifySignature?: (input: { headers: Headers; rawBody: string }) => boolean;
};

function buildService(): WhatsappIdentifyService {
  return new WhatsappIdentifyServiceImpl(
    new SupabaseWhatsappIdentityRepository(createWebSupabaseServiceClient())
  );
}

export async function handleWhatsappIdentifyPost(
  request: NextRequest,
  dependencies: WhatsappIdentifyRouteDependencies = {}
): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    if (
      !(dependencies.verifySignature ?? verifyWhatsappWebhookSignature)({
        headers: request.headers,
        rawBody,
      })
    )
      return errorResponse(401, "WEBHOOK_NO_AUTORIZADO");

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return errorResponse(400, "PAYLOAD_INVALIDO");
    }

    const parsed = parsePayload(payload);
    if (!parsed.ok)
      return errorResponse(
        mapErrorCodeToStatus(parsed.errorCode),
        parsed.errorCode
      );

    const outcome = await (dependencies.service ?? buildService()).identify({
      phone: parsed.phone,
      requiredCapability: REQUIRED_CAPABILITY,
    });
    if (!outcome.ok)
      return errorResponse(
        mapErrorCodeToStatus(outcome.errorCode),
        outcome.errorCode
      );

    return NextResponse.json({
      userIdentified: true,
      userId: outcome.user.userId,
      userName: outcome.user.userName,
      tenantId: outcome.user.tenantId,
      roles: outcome.user.roles,
      capabilities: outcome.user.capabilities,
    });
  } catch {
    return errorResponse(500, "ERROR_INTERNO");
  }
}

function parsePayload(payload: unknown): PayloadParseResult {
  if (!payload || typeof payload !== "object")
    return { ok: false, errorCode: "PAYLOAD_INVALIDO" };
  const candidate = payload as Record<string, unknown>;
  const phone = readPhone(candidate.phone);
  const text = readRequiredString(candidate.text);
  const timestamp = readRequiredString(candidate.timestamp);
  const provider = readRequiredString(candidate.provider);
  const providerMessageId = readRequiredString(candidate.provider_message_id);
  const type = readOptionalString(candidate.type);
  if (!phone.ok) return phone;
  if (
    !text ||
    !timestamp ||
    Number.isNaN(Date.parse(timestamp)) ||
    !provider ||
    !providerMessageId ||
    type === null ||
    (type && type !== "text")
  ) {
    return { ok: false, errorCode: "PAYLOAD_INVALIDO" };
  }
  return { ok: true, phone: phone.phone };
}

function readRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readPhone(value: unknown): PayloadParseResult {
  if (value == null) return { ok: false, errorCode: "USUARIO_NO_REGISTRADO" };
  if (typeof value !== "string")
    return { ok: false, errorCode: "PAYLOAD_INVALIDO" };

  const phone = value.trim();
  if (!phone || phone.replace(/\D/g, "").length === 0) {
    return { ok: false, errorCode: "USUARIO_NO_REGISTRADO" };
  }

  return { ok: true, phone };
}

function mapErrorCodeToStatus(code: string): number {
  switch (code) {
    case "USUARIO_NO_REGISTRADO":
      return 404;
    case "WEBHOOK_NO_AUTORIZADO":
      return 401;
    case "PAYLOAD_INVALIDO":
      return 400;
    default:
      return 403;
  }
}

function errorResponse(status: number, errorCode: string): NextResponse {
  return NextResponse.json(
    {
      userIdentified: false,
      errorCode,
      message:
        errorCode === "PAYLOAD_INVALIDO"
          ? "Payload rejected."
          : errorCode === "WEBHOOK_NO_AUTORIZADO"
            ? "Webhook authorization failed."
            : errorCode === "ERROR_INTERNO"
              ? "Unexpected identity failure."
              : "Controlled identity rejection.",
    },
    { status }
  );
}

type PayloadParseResult =
  | { ok: true; phone: string }
  | { ok: false; errorCode: "PAYLOAD_INVALIDO" | "USUARIO_NO_REGISTRADO" };
