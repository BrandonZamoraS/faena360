import { NextRequest, NextResponse } from "next/server";
import {
  GetValidationConfigServiceImpl,
  type ValidationConfigService,
} from "@faena360/application";
import { SupabaseValidationConfigRepository } from "@faena360/infrastructure";

import { createWebSupabaseServiceClient } from "../../../../lib/supabase";
import { verifyWhatsappWebhookSignature } from "../../../../lib/webhooks/hmac";

const REQUIRED_CAPABILITY = "whatsapp.channel.access";
const TENANT_HEADER = "X-Faena-Tenant-Id";
const USER_HEADER = "X-Faena-User-Id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidationConfigRouteDependencies = {
  service?: ValidationConfigService;
  verifySignature?: (input: {
    headers: Headers;
    rawBody: string;
    signedPayload?: string;
  }) => boolean;
};

function buildService(): ValidationConfigService {
  return new GetValidationConfigServiceImpl(
    new SupabaseValidationConfigRepository(createWebSupabaseServiceClient())
  );
}

export async function handleValidationConfigGet(
  request: NextRequest,
  dependencies: ValidationConfigRouteDependencies = {}
): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const tipoRaw = request.nextUrl.searchParams.get("tipo") ?? "";
    const tenantHeaderRaw = request.headers.get(TENANT_HEADER) ?? "";
    const userHeaderRaw = request.headers.get(USER_HEADER) ?? "";

    if (
      !(dependencies.verifySignature ?? verifyWhatsappWebhookSignature)({
        headers: request.headers,
        rawBody,
        signedPayload: buildSignedPayload({
          pathname: request.nextUrl.pathname,
          tipo: tipoRaw,
          tenantId: tenantHeaderRaw,
          userId: userHeaderRaw,
          rawBody,
        }),
      })
    ) {
      return errorResponse(401, "PERMISO_DENEGADO");
    }

    const tipo = tipoRaw.trim();
    if (!tipo) {
      return errorResponse(400, "TIPO_INVALIDO");
    }

    const tenantId = normalizeIdentifierHeader(tenantHeaderRaw);
    const userId = normalizeIdentifierHeader(userHeaderRaw);
    if (!tenantId || !userId) {
      return errorResponse(403, "TENANT_INVALIDO");
    }

    const outcome = await (dependencies.service ?? buildService()).getConfig({
      tipo,
      tenantId,
      userId,
      requiredCapability: REQUIRED_CAPABILITY,
    });

    if (!outcome.ok) {
      return errorResponse(
        mapErrorCodeToStatus(outcome.errorCode),
        outcome.errorCode
      );
    }

    return NextResponse.json(outcome.config);
  } catch {
    return errorResponse(500, "CONFIG_INVALIDA");
  }
}

function mapErrorCodeToStatus(errorCode: string): number {
  switch (errorCode) {
    case "TIPO_INVALIDO":
      return 400;
    case "PERMISO_DENEGADO":
      return 403;
    case "CONFIG_INVALIDA":
      return 500;
    default:
      return 403;
  }
}

function errorResponse(status: number, errorCode: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      errorCode,
      message: "Controlled validation-config rejection.",
    },
    { status }
  );
}

function normalizeIdentifierHeader(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function buildSignedPayload(input: {
  pathname: string;
  tipo: string;
  tenantId: string;
  userId: string;
  rawBody: string;
}): string {
  return JSON.stringify({
    method: "GET",
    path: input.pathname,
    query: { tipo: input.tipo },
    headers: {
      "x-faena-tenant-id": input.tenantId,
      "x-faena-user-id": input.userId,
    },
    body: input.rawBody,
  });
}
