import { NextRequest, NextResponse } from "next/server";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
  type AppSessionRefresher,
  type CookieContainer,
} from "../../../../lib/auth/session";
import { SupabaseAppSessionRepository } from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../../lib/supabase";

export type MeRouteDependencies = {
  sessionRefresher?: AppSessionRefresher;
};

function resolveSessionRefresher(
  dependencies: MeRouteDependencies = {}
): AppSessionRefresher {
  if (dependencies.sessionRefresher) {
    return dependencies.sessionRefresher;
  }

  const supabase = createWebSupabaseServiceClient();
  const repository = new SupabaseAppSessionRepository(supabase);
  return createServerStateSessionRefresher(repository);
}

function getCookiesFromRequest(request: NextRequest): CookieContainer {
  return {
    get: (name) => request.cookies.get(name),
  };
}

export async function handleMeGet(
  request: NextRequest,
  dependencies: MeRouteDependencies = {}
): Promise<NextResponse> {
  const sessionRefresher = resolveSessionRefresher(dependencies);
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

export async function handleMePost(
  request: NextRequest,
  dependencies: MeRouteDependencies = {}
): Promise<NextResponse> {
  const sessionRefresher = resolveSessionRefresher(dependencies);
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
