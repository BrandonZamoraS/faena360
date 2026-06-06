import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppAuthErrorCode } from "@faena360/domain";
import {
  LoginWithEmailPasswordServiceImpl,
} from "../../../../../../packages/application/src/auth/app-session";
import type { AppSessionRepository } from "../../../../../../packages/application/src/auth/index";
import { APP_SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { handleLoginDelete, handleLoginPost } from "./handler";

const successfulSession = {
  user_id: "user-id",
  auth_user_id: "auth-user-id",
  tenant_id: "tenant-id",
  email: "admin@faena360.com",
  roles: ["admin"],
  effective_capabilities: ["web.portal.access"],
  status: "active" as const,
  can_access_web: true,
};

const supervisorSuccessfulSession = {
  ...successfulSession,
  user_id: "supervisor-user-id",
  auth_user_id: "supervisor-auth-id",
  email: "supervisor@faena360.com",
  roles: ["supervisor"],
  effective_capabilities: ["web.portal.access"],
};

type LoginRole =
  | "admin"
  | "supervisor"
  | "operator"
  | "maintenance"
  | "fuel_dispatcher";

function buildRoleCapabilities(role: LoginRole): readonly string[] {
  if (role === "admin" || role === "supervisor") {
    return ["web.portal.access", "orders.read"];
  }

  if (role === "operator") {
    return ["dispatch.orders.view"];
  }

  if (role === "maintenance") {
    return ["maintenance.view"];
  }

  return ["fuel.dispatch.view"];
}

function buildLoginServiceForRole(
  input: {
    role?: LoginRole;
    tenantStatus?: "active" | "inactive";
    userStatus?: "active" | "inactive";
    signInThrows?: boolean;
    missingUserProfile?: boolean;
  } = {}
) {
  const role = input.role ?? "admin";
  const tenantStatus = input.tenantStatus ?? "active";
  const userStatus = input.userStatus ?? "active";
  const tenantId = "tenant-id";

  const identityPort = {
    signInWithPassword: vi.fn(async () => {
      if (input.signInThrows) {
        throw new Error("invalid credentials");
      }

      return {
        id: `${role}-auth-id`,
        email: `${role}@faena360.com`,
        tenantId,
      };
    }),
  };

  const repository: AppSessionRepository = {
    getTenant: async () => {
      if (tenantStatus === "inactive") {
        return { id: tenantId, status: "inactive" };
      }

      return { id: tenantId, status: "active" };
    },
    getUserProfile: async () => {
      if (input.missingUserProfile) {
        return null;
      }

      return {
        userId: `${role}-user-id`,
        email: `${role}@faena360.com`,
        status: userStatus,
        tenantId,
      };
    },
    listUserRoles: async () => [role],
    listTenantRoleCapabilities: async () => buildRoleCapabilities(role),
    hasWebAccessRole: async ({ roleIds = [] }) =>
      roleIds.some((value) => value === "admin" || value === "supervisor"),
    listUserCapabilityOverrides: async () => [],
  };

  return {
    service: new LoginWithEmailPasswordServiceImpl(identityPort, repository),
    signInWithPassword: identityPort.signInWithPassword,
  };
}

function buildLoginRequest(email: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "password" }),
  });
}

process.env.APP_SESSION_SECRET = "test-session-secret";

describe("POST /api/auth/login", () => {
  it("writes app session cookie on success", async () => {
    const login = vi.fn().mockResolvedValue({ ok: true, session: successfulSession });

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@faena360.com", password: "password" }),
    });

    const response = await handleLoginPost(request, { service: { login } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.session.user_id).toBe(successfulSession.user_id);
    expect(payload.session.can_access_web).toBe(true);
    const cookieValue = response.cookies.get(APP_SESSION_COOKIE_NAME)?.value;

    expect(cookieValue).toBeTruthy();
    expect(cookieValue).not.toContain("tenant_id");
    expect(cookieValue).toMatch(/^[^\s]+\.[^\s]+\.[^\s]+\.[^\s]+$/);
  });

  it("maps auth failures to expected HTTP codes", async () => {
    for (const code of [
      "invalid_credentials",
      "inactive_tenant",
      "inactive_user",
      "web_access_denied",
    ] as AppAuthErrorCode[]) {
      const login = vi.fn().mockResolvedValue({ ok: false, code });

      const request = new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@faena360.com", password: "password" }),
      });

      const response = await handleLoginPost(request, { service: { login } });
      const payload = await response.json();

      expect(response.status).toBe(code === "invalid_credentials" ? 401 : 403);
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe(code);
    }
  });

  it("accepts Supervisor users when web access is allowed", async () => {
    const login = vi.fn().mockResolvedValue({ ok: true, session: supervisorSuccessfulSession });

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "supervisor@faena360.com", password: "password" }),
    });

    const response = await handleLoginPost(request, { service: { login } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.session.user_id).toBe(supervisorSuccessfulSession.user_id);
    expect(payload.session.roles).toEqual(["supervisor"]);
    expect(payload.session.can_access_web).toBe(true);
  });

  describe("using the real login service", () => {
    it.each([
      ["admin", 200, true],
      ["supervisor", 200, true],
      ["operator", 403, false],
      ["maintenance", 403, false],
      ["fuel_dispatcher", 403, false],
    ] as const)(
      "%s role login %s",
      async (role, expectedStatus, shouldSucceed) => {
        const { service } = buildLoginServiceForRole({ role });

        const response = await handleLoginPost(
          buildLoginRequest(`${role}@faena360.com`),
          { service }
        );
        const payload = await response.json();

        expect(response.status).toBe(expectedStatus);
        expect(payload.ok).toBe(shouldSucceed);

        if (shouldSucceed) {
          expect(payload.session.can_access_web).toBe(true);
          expect(payload.session.roles).toContain(role);
        } else {
          expect(payload.code).toBe("web_access_denied");
        }
      }
    );

    it("rejects inactive users", async () => {
      const { service } = buildLoginServiceForRole({
        role: "operator",
        userStatus: "inactive",
      });

      const response = await handleLoginPost(
        buildLoginRequest("operator@faena360.com"),
        { service }
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe("inactive_user");
    });

    it("rejects inactive tenants", async () => {
      const { service } = buildLoginServiceForRole({
        role: "admin",
        tenantStatus: "inactive",
      });

      const response = await handleLoginPost(
        buildLoginRequest("admin@faena360.com"),
        { service }
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe("inactive_tenant");
    });

    it("maps auth provider errors to invalid_credentials", async () => {
      const { service } = buildLoginServiceForRole({
        role: "admin",
        signInThrows: true,
      });

      const response = await handleLoginPost(
        buildLoginRequest("admin@faena360.com"),
        { service }
      );
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe("invalid_credentials");
    });
  });

  it("rejects invalid JSON body", async () => {
    const login = vi.fn();
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: "{ not-json",
    });

    const response = await handleLoginPost(request, { service: { login } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
  });

  it("requires email and password", async () => {
    const login = vi.fn();
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@faena360.com" }),
    });

    const response = await handleLoginPost(request, { service: { login } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
  });

  it("rejects non-object JSON payloads", async () => {
    const login = vi.fn();
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify(null),
    });

    const response = await handleLoginPost(request, { service: { login } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects non-string credentials", async () => {
    const login = vi.fn();
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: 1, password: true }),
    });

    const response = await handleLoginPost(request, { service: { login } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(login).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/login", () => {
  it("clears the session cookie", async () => {
    const response = await handleLoginDelete();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(response.cookies.get(APP_SESSION_COOKIE_NAME)?.value).toBe("");
  });
});
