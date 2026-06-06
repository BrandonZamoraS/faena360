import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { AppSession } from "@faena360/domain";
import {
  APP_SESSION_COOKIE_NAME,
  type AppSessionRefresher,
  writeAppSessionCookie,
} from "../../../../lib/auth/session";
import { GET, POST } from "./route";

process.env.APP_SESSION_SECRET = "test-session-secret";

const baseSession = {
  user_id: "user-id",
  auth_user_id: "auth-user-id",
  tenant_id: "tenant-id",
  email: "admin@faena360.com",
  roles: ["admin"],
  effective_capabilities: ["web.portal.access"],
  status: "active" as const,
  can_access_web: true,
};

function buildSignedSessionCookie(session = baseSession): string {
  const response = NextResponse.json({});

  writeAppSessionCookie(response, session);

  return response.cookies.get(APP_SESSION_COOKIE_NAME)?.value ?? "";
}

function buildTamperedCookie(cookie: string): string {
  const parts = cookie.split(".");
  if (parts.length !== 4) {
    return "invalid.cookie.format";
  }

  const payload = parts[2];
  const tamperedPayload = payload.length > 0 ? `${payload.slice(0, -1)}z` : "z";

  return `${parts[0]}.${parts[1]}.${tamperedPayload}.${parts[3]}`;
}

function buildRequest(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/me", {
    method: "GET",
    headers: cookie
      ? {
          Cookie: `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(cookie)}`,
        }
      : undefined,
  });
}

const allowFreshSession: AppSessionRefresher = async (session) => session;

function buildContext(sessionRefresher: AppSessionRefresher) {
  return {
    sessionRefresher,
  };
}

function buildInactiveTenantSessionRefresher(): AppSessionRefresher {
  return async () => null;
}

function buildInactiveUserSessionRefresher(): AppSessionRefresher {
  return async () => null;
}

function buildWebAccessRemovedSessionRefresher(): AppSessionRefresher {
  return async (session: AppSession) => ({
    ...session,
    can_access_web: false,
    roles: ["operator"],
  });
}

describe("GET /api/auth/me", () => {
  it("returns unauthorized when no session exists", async () => {
    const request = buildRequest();
    const response = await GET(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("invalid_session");
  });

  it("rejects forged client JSON cookies", async () => {
    const request = buildRequest(JSON.stringify(baseSession));
    const response = await GET(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("invalid_session");
  });

  it("rejects tampered session cookies", async () => {
    const request = buildRequest(buildTamperedCookie(buildSignedSessionCookie(baseSession)));
    const response = await GET(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("invalid_session");
  });

  it("returns public session information", async () => {
    const request = buildRequest(buildSignedSessionCookie(baseSession));
    const response = await GET(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.user_id).toBe(baseSession.user_id);
    expect(payload.can_access_web).toBe(true);
  });

  it("denies access when tenant is no longer active", async () => {
    const request = buildRequest(buildSignedSessionCookie(baseSession));

    const response = await GET(
      request,
      buildContext(buildInactiveTenantSessionRefresher())
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("invalid_session");
  });

  it("denies access when user is no longer active", async () => {
    const request = buildRequest(buildSignedSessionCookie(baseSession));

    const response = await GET(request, buildContext(buildInactiveUserSessionRefresher()));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("invalid_session");
  });

  it("denies access when refreshed session cannot access web", async () => {
    const request = buildRequest(buildSignedSessionCookie(baseSession));
    const response = await GET(
      request,
      buildContext(buildWebAccessRemovedSessionRefresher())
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("web_access_denied");
  });
});

describe("POST /api/auth/me", () => {
  it("returns authorized payload when web access is allowed", async () => {
    const request = new NextRequest("http://localhost/api/auth/me", {
      method: "POST",
      headers: {
        Cookie: `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(buildSignedSessionCookie(baseSession))}`,
      },
    });

    const response = await POST(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toBe("private web route access granted");
  });

  it("allows Supervisor role when web access is granted", async () => {
    const supervisorSession = {
      ...baseSession,
      roles: ["supervisor"],
      can_access_web: true,
    };

    const request = new NextRequest("http://localhost/api/auth/me", {
      method: "POST",
      headers: {
        Cookie: `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(buildSignedSessionCookie(supervisorSession))}`,
      },
    });

    const response = await POST(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.user_id).toBe(supervisorSession.user_id);
    expect(payload.can_access_web).toBe(true);
  });

  it("denies web access when capability missing", async () => {
    const noAccessSession = {
      ...baseSession,
      can_access_web: false,
    };

    const request = new NextRequest("http://localhost/api/auth/me", {
      method: "POST",
      headers: {
        Cookie: `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(buildSignedSessionCookie(noAccessSession))}`,
      },
    });

    const response = await POST(request, buildContext(allowFreshSession));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("web_access_denied");
  });

  it("denies private route when web access was removed from current roles", async () => {
    const request = new NextRequest("http://localhost/api/auth/me", {
      method: "POST",
      headers: {
        Cookie: `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(buildSignedSessionCookie(baseSession))}`,
      },
    });

    const response = await POST(
      request,
      buildContext(buildWebAccessRemovedSessionRefresher())
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("web_access_denied");
  });
});
