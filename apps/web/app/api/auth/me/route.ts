import { NextRequest, NextResponse } from "next/server";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
  type CookieContainer,
  type AppSessionRefresher,
} from "../../../../lib/auth/session";
import { SupabaseAppSessionRepository } from "../../../../../../packages/infrastructure/src/auth";
import { createWebSupabaseClient } from "../../../../lib/supabase";

type RouteDependencies = {
  sessionRefresher?: AppSessionRefresher;
};

function resolveSessionRefresher(
  context?: RouteDependencies
): AppSessionRefresher {
  if (context?.sessionRefresher) {
    return context.sessionRefresher;
  }

  const supabase = createWebSupabaseClient();
  const repository = new SupabaseAppSessionRepository(supabase);
  return createServerStateSessionRefresher(repository);
}

function getCookiesFromRequest(request: NextRequest): CookieContainer {
  return {
    get: (name) => request.cookies.get(name),
  };
}

export async function GET(
  request: NextRequest,
  context?: RouteDependencies
): Promise<NextResponse> {
  const sessionRefresher = resolveSessionRefresher(context);
  const authResult = await requireWebAccess(getCookiesFromRequest(request), {
    sessionRefresher,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  return NextResponse.json({
    ok: true,
    user_id: authResult.session.user_id,
    tenant_id: authResult.session.tenant_id,
    email: authResult.session.email,
    roles: authResult.session.roles,
    can_access_web: authResult.session.can_access_web,
  });
}

export async function POST(
  request: NextRequest,
  context?: RouteDependencies
): Promise<NextResponse> {
  const sessionRefresher = resolveSessionRefresher(context);
  const authResult = await requireWebAccess(getCookiesFromRequest(request), {
    sessionRefresher,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  return NextResponse.json({
    ok: true,
    message: "private web route access granted",
    user_id: authResult.session.user_id,
    tenant_id: authResult.session.tenant_id,
    email: authResult.session.email,
    can_access_web: authResult.session.can_access_web,
  });
}
