import { NextRequest, NextResponse } from "next/server";
import {
  clearAppSessionCookie,
  writeAppSessionCookie,
} from "../../../../lib/auth/session";
import {
  SupabaseAuthAdapter,
  SupabaseAppSessionRepository,
} from "@faena360/infrastructure";
import {
  type LoginWithEmailPasswordService,
  LoginWithEmailPasswordServiceImpl,
} from "@faena360/application";
import { createWebSupabaseClient } from "../../../../lib/supabase";
import { createWebSupabaseServiceClient } from "../../../../lib/supabase";

/**
 * Handler de API auth/login para orquestar la autenticación web.
 */

export type LoginRouteDependencies = {
  service?: LoginWithEmailPasswordService;
};

/**
 * Construye el caso de uso real con adaptadores de infraestructura.
 */

function buildLoginService(): LoginWithEmailPasswordService {
  // Capa Web/Delivery: compone adaptadores concretos para ejecutar el caso de
  // uso. La ruta conoce Next.js y Supabase; Application solo recibe puertos.
  const supabase = createWebSupabaseClient();
  const serviceSupabase = createWebSupabaseServiceClient();

  return new LoginWithEmailPasswordServiceImpl(
    new SupabaseAuthAdapter(supabase),
    new SupabaseAppSessionRepository(serviceSupabase)
  );
}

/**
 * Mapeo de resultados de dominio a estatus HTTP para la API de login.
 */
function mapCodeToStatus(
  code:
    | "invalid_credentials"
    | "missing_tenant"
    | "inactive_tenant"
    | "inactive_user"
    | "web_access_denied"
): number {
  switch (code) {
    case "invalid_credentials":
      return 401;
    case "inactive_tenant":
    case "missing_tenant":
    case "inactive_user":
    case "web_access_denied":
      return 403;
    default:
      return 400;
  }
}

export async function handleLoginPost(
  request: NextRequest,
  dependencies: LoginRouteDependencies = {}
): Promise<NextResponse> {
  // El handler se mantiene separado de `route.ts` para poder inyectar el caso de
  // uso en tests sin romper la firma exigida por Next App Router.
  const service = dependencies.service ?? buildLoginService();
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_credentials",
        message: "Request payload must be valid JSON.",
      },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_credentials",
        message: "Email and password are required.",
      },
      { status: 400 }
    );
  }

  const credentials = payload as { email?: unknown; password?: unknown };
  const email =
    typeof credentials.email === "string" ? credentials.email.trim() : "";
  const password =
    typeof credentials.password === "string" ? credentials.password : "";

  if (!email || !password) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_credentials",
        message: "Email and password are required.",
      },
      { status: 400 }
    );
  }

  const outcome = await service.login({ email, password });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: outcome.code,
      },
      { status: mapCodeToStatus(outcome.code) }
    );
  }

  const response = NextResponse.json({
    ok: true,
    code: "ok",
    session: {
      user_id: outcome.session.user_id,
      email: outcome.session.email,
      tenant_id: outcome.session.tenant_id,
      roles: outcome.session.roles,
      can_access_web: outcome.session.can_access_web,
    },
  });

  // La cookie no reemplaza la autorización server-side: guarda una sesión firmada
  // para identificar al usuario, pero `/me` y las guardas la revalidan contra DB.
  writeAppSessionCookie(response, outcome.session);
  return response;
}

export async function handleLoginDelete(): Promise<NextResponse> {
  // Endpoint de logout de sesión de aplicación, sin tocar estado remoto de Auth.
  const response = NextResponse.json({ ok: true, code: "logged_out" });
  clearAppSessionCookie(response);
  return response;
}
