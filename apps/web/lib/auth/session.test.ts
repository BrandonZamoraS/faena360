import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import type { AppSession } from "@faena360/domain";
import type { AppSessionRepository } from "@faena360/application";
import {
  APP_SESSION_COOKIE_NAME,
  createServerStateSessionRefresher,
  getAppSession,
  requireWebAccess,
  writeAppSessionCookie,
} from "./session";

process.env.APP_SESSION_SECRET = "test-session-secret";

function buildSignedSessionCookie(session: AppSession): string {
  const response = NextResponse.json({});

  writeAppSessionCookie(response, session);

  return response.cookies.get(APP_SESSION_COOKIE_NAME)?.value ?? "";
}

function buildRequestWithCookie(cookie: string): { get(name: string): { value: string } | undefined } {
  return {
    get(name: string) {
      if (name === APP_SESSION_COOKIE_NAME) {
        return { value: cookie };
      }

      return undefined;
    },
  };
}

function buildRepository(
  input: {
    tenantId?: string;
    tenantStatus?: "active" | "inactive";
    userStatus?: "active" | "inactive";
    userTenantId?: string;
    userProfile?: null | {
      readonly userId?: string;
      readonly email?: string;
      readonly status?: "active" | "inactive";
      readonly tenantId?: string;
    };
    roles?: readonly string[];
    roleCapabilities?: readonly string[];
    userOverrides?: readonly { capabilityCode: string; effect: "allow" | "deny" }[];
    webAccess?: boolean;
  } = {}
): AppSessionRepository {
  const {
    tenantId = "tenant-id",
    tenantStatus = "active",
    userStatus = "active",
    userTenantId,
    userProfile,
    roles = ["admin"],
    roleCapabilities = ["web.portal.access"],
    userOverrides = [],
    webAccess = true,
  } = input;

  const resolvedUserProfile =
    userProfile === undefined
      ? {
          userId: "user-id",
          email: "admin@faena360.com",
          status: userStatus,
          tenantId: userTenantId ?? tenantId,
        }
      : userProfile;

  return {
    getTenant: async () => ({ id: tenantId, status: tenantStatus }),
    getUserProfile: async () =>
      resolvedUserProfile === null
        ? null
        : {
            userId: resolvedUserProfile.userId ?? "user-id",
            email: resolvedUserProfile.email ?? "admin@faena360.com",
            status: resolvedUserProfile.status ?? userStatus,
            tenantId: resolvedUserProfile.tenantId ?? tenantId,
          },
    listUserRoles: async () => roles,
    listTenantRoleCapabilities: async () => roleCapabilities,
    listUserCapabilityOverrides: async () => userOverrides,
    hasWebAccessRole: async () => webAccess,
  };
}

describe("Session refresher recomputes effective capabilities", () => {
  it("refreshes effective capabilities and web access from current repository state", async () => {
    const cookie = buildSignedSessionCookie({
      user_id: "user-id",
      auth_user_id: "auth-user-id",
      tenant_id: "tenant-id",
      email: "admin@faena360.com",
      roles: ["admin"],
      effective_capabilities: ["web.portal.access"],
      status: "active",
      can_access_web: true,
    });

    const refresher = createServerStateSessionRefresher(
      buildRepository({
        roles: ["operator"],
        roleCapabilities: ["dispatch.orders.view"],
        webAccess: false,
      })
    );

    const refreshed = await getAppSession(buildRequestWithCookie(cookie), {
      sessionRefresher: refresher,
    });

    expect(refreshed).toMatchObject({
      roles: ["operator"],
      can_access_web: false,
      effective_capabilities: ["dispatch.orders.view"],
    });
  });

  it("replays user capability overrides after role resolution", async () => {
    const cookie = buildSignedSessionCookie({
      user_id: "user-id",
      auth_user_id: "auth-user-id",
      tenant_id: "tenant-id",
      email: "admin@faena360.com",
      roles: ["operator"],
      effective_capabilities: ["web.portal.access"],
      status: "active",
      can_access_web: false,
    });

    const refresher = createServerStateSessionRefresher(
      buildRepository({
        roles: ["admin"],
        roleCapabilities: ["orders.read", "web.portal.access"],
        webAccess: true,
        userOverrides: [
          { capabilityCode: "dispatch.orders.create", effect: "allow" },
          { capabilityCode: "orders.read", effect: "deny" },
        ],
      })
    );

    const refreshed = await getAppSession(buildRequestWithCookie(cookie), {
      sessionRefresher: refresher,
    });

    expect(refreshed).not.toBeNull();
    expect(refreshed?.effective_capabilities).toEqual([
      "web.portal.access",
      "dispatch.orders.create",
    ]);
    expect(refreshed?.roles).toEqual(["admin"]);
    expect(refreshed?.can_access_web).toBe(true);
  });
});

describe("createServerStateSessionRefresher", () => {
  const baseSession: AppSession = {
    user_id: "user-id",
    auth_user_id: "auth-user-id",
    tenant_id: "tenant-id",
    email: "admin@faena360.com",
    roles: ["admin"],
    effective_capabilities: ["web.portal.access"],
    status: "active",
    can_access_web: true,
  };

  it("returns null when tenant is inactive", async () => {
    const refresher = createServerStateSessionRefresher(
      buildRepository({ tenantStatus: "inactive" })
    );

    await expect(refresher(baseSession)).resolves.toBeNull();
  });

  it("returns null when user is inactive", async () => {
    const refresher = createServerStateSessionRefresher(
      buildRepository({ userStatus: "inactive" })
    );

    await expect(refresher(baseSession)).resolves.toBeNull();
  });

  it("returns null when user profile is missing", async () => {
    const refresher = createServerStateSessionRefresher(
      buildRepository({ userProfile: null })
    );

    await expect(refresher(baseSession)).resolves.toBeNull();
  });

  it("returns null when tenant does not match", async () => {
    const refresher = createServerStateSessionRefresher(
      buildRepository({ userTenantId: "other-tenant" })
    );

    await expect(refresher(baseSession)).resolves.toBeNull();
  });
});

describe("requireWebAccess", () => {
  it("requires both policy flag and web.portal.access capability", async () => {
    const userSession = {
      user_id: "user-id",
      auth_user_id: "auth-user-id",
      tenant_id: "tenant-id",
      email: "admin@faena360.com",
      roles: ["admin"],
      effective_capabilities: ["orders.read"],
      status: "active" as const,
      can_access_web: true,
    } satisfies AppSession;

    const cookie = buildSignedSessionCookie(userSession);
    const response = await requireWebAccess(
      buildRequestWithCookie(cookie),
      {
        sessionRefresher: createServerStateSessionRefresher(
          buildRepository({
            roles: ["admin"],
            roleCapabilities: ["orders.read"],
            webAccess: true,
          })
        ),
      }
    );

    expect(response.ok).toBe(false);
    if (response.ok) {
      return;
    }

    expect(response.response.status).toBe(403);

    const payload = await response.response.json();
    expect(payload.code).toBe("web_access_denied");
  });
});
