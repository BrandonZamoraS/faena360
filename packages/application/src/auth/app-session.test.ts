import { describe, expect, it } from "vitest";
import { AppAuthErrorCode, type AppSession } from "../../../domain/src";
import {
  LoginWithEmailPasswordServiceImpl,
  type LoginInput,
} from "./index";

const baseInput: LoginInput = {
  email: "alice@example.com",
  password: "CorrectHorseBatteryStaple",
};

function createRepository(overrides: {
  tenantStatus?: string;
  tenantId?: string;
  missingTenant?: boolean;
  userProfile?: {
    userId: string;
    email: string;
    status: "active" | "inactive";
    tenantId: string;
  } | null;
  userRoles?: readonly string[];
  tenantRoleCapabilities?: readonly string[];
  hasWebAccessRole?: boolean;
  userCapabilityOverrides?: readonly {
    capabilityCode: string;
    effect: "allow" | "deny";
  }[];
}) {
  return {
    getTenant: async () => {
      if (overrides.missingTenant) {
        throw new Error("tenant-not-found");
      }

      return {
        id: overrides.tenantId ?? "tenant-001",
        status: overrides.tenantStatus ?? "active",
      };
    },
    getUserProfile: async () => overrides.userProfile ?? null,
    listUserRoles: async () => overrides.userRoles ?? [],
    listTenantRoleCapabilities: async () =>
      overrides.tenantRoleCapabilities ?? [],
    hasWebAccessRole: async () => overrides.hasWebAccessRole ?? true,
    listUserCapabilityOverrides: async () =>
      overrides.userCapabilityOverrides ?? [],
  };
}

const successSession: AppSession = {
  user_id: "user-123",
  auth_user_id: "supabase-auth-id",
  tenant_id: "tenant-001",
  email: "alice@example.com",
  roles: ["admin", "finance"],
  effective_capabilities: ["orders.read", "web.portal.access"],
  status: "active",
  can_access_web: true,
};

describe("app-session login", () => {
  it("allows users assigned to web roles to login", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({
      userProfile: {
        userId: "user-123",
        email: "alice@example.com",
        status: "active",
        tenantId: "tenant-001",
      },
      userRoles: ["admin", "finance"],
      tenantRoleCapabilities: ["orders.read", "web.portal.access"],
      userCapabilityOverrides: [],
      hasWebAccessRole: true,
    });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: true,
      session: successSession,
    });
  });

  it("uses tenant from auth metadata and never requires external tenant input", async () => {
    let capturedTenantId: string | undefined;

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-from-metadata-only",
      }),
    };

    const repository = {
      ...createRepository({
        tenantId: "tenant-from-metadata-only",
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-from-metadata-only",
        },
        tenantRoleCapabilities: ["web.portal.access"],
      }),
      getTenant: async ({ tenantId }: { tenantId: string }) => {
        capturedTenantId = tenantId;
        return {
          id: tenantId,
          status: "active",
        };
      },
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await service.login(baseInput);

    expect(capturedTenantId).toBe("tenant-from-metadata-only");
  });

  it("rejects missing tenant metadata as inactive_tenant", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: undefined,
      }),
    };

    const repository = createRepository({});

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_tenant" as AppAuthErrorCode,
    });
  });

  it("rejects inactive tenants", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({ tenantStatus: "inactive" });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_tenant" as AppAuthErrorCode,
    });
  });

  it("rejects missing tenant row as inactive_tenant", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({
      missingTenant: true,
    });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_tenant" as AppAuthErrorCode,
    });
  });

  it("rejects missing user profile as inactive_user", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({
      userProfile: null,
    });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_user" as AppAuthErrorCode,
    });
  });

  it("rejects inactive user profile as inactive_user", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({
      userProfile: {
        userId: "user-123",
        email: baseInput.email,
        status: "inactive",
        tenantId: "tenant-001",
      },
    });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_user" as AppAuthErrorCode,
    });
  });

  it("normalizes sign-in failures to invalid_credentials", async () => {
    const service = new LoginWithEmailPasswordServiceImpl(
      {
        signInWithPassword: async () => {
          throw new Error("invalid credentials");
        },
      },
      createRepository({})
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "invalid_credentials" as AppAuthErrorCode,
    });
  });

  it("denies users without web access role with web_access_denied", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({
      userProfile: {
        userId: "user-123",
        email: baseInput.email,
        status: "active",
        tenantId: "tenant-001",
      },
      userRoles: ["operator"],
      tenantRoleCapabilities: ["orders.read"],
      userCapabilityOverrides: [
        {
          capabilityCode: "web.portal.access",
          effect: "allow",
        },
      ],
      hasWebAccessRole: false,
    });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "web_access_denied" as AppAuthErrorCode,
    });
  });

  it("denies users when role lookup fails", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = {
      ...createRepository({
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-001",
        },
        tenantRoleCapabilities: ["orders.read", "web.portal.access"],
      }),
      listUserRoles: async () => {
        throw new Error("roles-unavailable");
      },
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "web_access_denied" as AppAuthErrorCode,
    });
  });

  it("maps operational role to denied web access", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
    };

    const repository = createRepository({
      userProfile: {
        userId: "user-123",
        email: baseInput.email,
        status: "active",
        tenantId: "tenant-001",
      },
      userRoles: ["operator", "maintenance", "fuel_dispatcher"],
      tenantRoleCapabilities: ["work.orders.read"],
      userCapabilityOverrides: [],
      hasWebAccessRole: false,
    });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "web_access_denied" as AppAuthErrorCode,
    });
  });
});
