import { describe, expect, it, vi } from "vitest";
import { AppAuthErrorCode, type AppSession } from "@faena360/domain";
import { LoginWithEmailPasswordServiceImpl, type LoginInput } from "./index";

const baseInput: LoginInput = {
  email: "alice@example.com",
  password: "CorrectHorseBatteryStaple",
};

const baseSession: AppSession = {
  user_id: "user-123",
  auth_user_id: "supabase-auth-id",
  tenant_id: "tenant-001",
  email: "alice@example.com",
  roles: ["operator", "finance"],
  effective_capabilities: ["orders.read", "web.portal.access"],
  status: "active",
  can_access_web: true,
};

function createRepository(overrides: {
  tenantStatus?: string;
  tenantId?: string;
  missingTenant?: boolean;
  userProfile?: {
    userId: string;
    email?: string | null;
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
    listUserRoles: async () => overrides.userRoles ?? ["operator", "finance"],
    listTenantRoleCapabilities: async () =>
      overrides.tenantRoleCapabilities ?? [],
    hasWebAccessRole: async () => overrides.hasWebAccessRole ?? true,
    listUserCapabilityOverrides: async () =>
      overrides.userCapabilityOverrides ?? [],
  };
}

describe("app-session login", () => {
  it("returns a valid app session when all authorization checks pass", async () => {
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
      session: baseSession,
    });
  });

  it("uses tenant from auth metadata and never external parameter", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-from-metadata",
      }),
    };

    const repository = {
      ...createRepository({
        tenantId: "tenant-from-metadata",
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-from-metadata",
        },
        tenantRoleCapabilities: ["orders.read", "web.portal.access"],
      }),
      getTenant: async ({ tenantId }: { tenantId: string }) => ({
        id: tenantId,
        status: "active",
      }),
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await service.login(baseInput);
    await expect(service.login(baseInput)).resolves.toMatchObject({
      ok: true,
      session: expect.objectContaining({ tenant_id: "tenant-from-metadata" }),
    });
  });

  it("uses profile email before auth email and falls back when profile email is blank", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: "auth-fallback@example.com",
        tenantId: "tenant-001",
      }),
    };

    const repositoryWithProfileEmail = createRepository({
      userProfile: {
        userId: "user-123",
        email: "profile@example.com",
        status: "active",
        tenantId: "tenant-001",
      },
      tenantRoleCapabilities: ["orders.read", "web.portal.access"],
      userRoles: ["operator", "finance"],
      hasWebAccessRole: true,
      userCapabilityOverrides: [],
    });

    const serviceWithProfileEmail = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repositoryWithProfileEmail
    );

    await expect(serviceWithProfileEmail.login(baseInput)).resolves.toEqual({
      ok: true,
      session: {
        ...baseSession,
        email: "profile@example.com",
      },
    });

    const repositoryWithMissingProfileEmail = createRepository({
      userProfile: {
        userId: "user-123",
        email: null,
        status: "active",
        tenantId: "tenant-001",
      },
      tenantRoleCapabilities: ["orders.read", "web.portal.access"],
      userRoles: ["operator", "finance"],
      hasWebAccessRole: true,
      userCapabilityOverrides: [],
    });

    const serviceWithFallbackEmail = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repositoryWithMissingProfileEmail
    );

    await expect(serviceWithFallbackEmail.login(baseInput)).resolves.toEqual({
      ok: true,
      session: {
        ...baseSession,
        email: "auth-fallback@example.com",
      },
    });
  });

  it("rejects missing auth metadata tenant as missing_tenant", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: undefined,
      }),
      signOut,
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      createRepository({})
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "missing_tenant" as AppAuthErrorCode,
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("rejects inactive tenant as inactive_tenant", async () => {
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut: vi.fn(async () => {}),
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

    expect(identityPort.signOut).toHaveBeenCalledOnce();
  });

  it("rejects missing tenant row as inactive_tenant", async () => {
    const signOut = vi.fn(async () => {});
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const repository = createRepository({ missingTenant: true });

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      repository
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_tenant" as AppAuthErrorCode,
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("rejects missing profile as inactive_user", async () => {
    const signOut = vi.fn(async () => {});
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      createRepository({ userProfile: null })
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_user" as AppAuthErrorCode,
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("rejects inactive profile as inactive_user", async () => {
    const signOut = vi.fn(async () => {});
    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      createRepository({
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "inactive",
          tenantId: "tenant-001",
        },
      })
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "inactive_user" as AppAuthErrorCode,
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("rejects profile or auth email missing", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: "",
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const repository = createRepository({
      userProfile: {
        userId: "user-123",
        email: null,
        status: "active",
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

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("normalizes invalid credentials to invalid_credentials", async () => {
    const signOut = vi.fn(async () => {});

    const service = new LoginWithEmailPasswordServiceImpl(
      {
        signInWithPassword: async () => {
          throw new Error("invalid credentials");
        },
        signOut,
      },
      createRepository({})
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "invalid_credentials" as AppAuthErrorCode,
    });

    expect(signOut).not.toHaveBeenCalled();
  });

  it("denies users when web access role is false", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      createRepository({
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-001",
        },
        tenantRoleCapabilities: ["orders.read", "web.portal.access"],
        hasWebAccessRole: false,
      })
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "web_access_denied" as AppAuthErrorCode,
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("denies users when role capabilities do not include web portal access", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const service = new LoginWithEmailPasswordServiceImpl(
      identityPort,
      createRepository({
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-001",
        },
        tenantRoleCapabilities: ["orders.read"],
        hasWebAccessRole: true,
      })
    );

    await expect(service.login(baseInput)).resolves.toEqual({
      ok: false,
      code: "web_access_denied" as AppAuthErrorCode,
    });

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("denies users when role lookup fails", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const repository = {
      ...createRepository({
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-001",
        },
      }),
      listUserRoles: async () => {
        throw new Error("role lookup failed");
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

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("denies users when capability lookup fails", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
    };

    const repository = {
      ...createRepository({
        userProfile: {
          userId: "user-123",
          email: baseInput.email,
          status: "active",
          tenantId: "tenant-001",
        },
      }),
      listTenantRoleCapabilities: async () => {
        throw new Error("capability lookup failed");
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

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("denies users when web access lookup fails", async () => {
    const signOut = vi.fn(async () => {});

    const identityPort = {
      signInWithPassword: async () => ({
        id: "supabase-auth-id",
        email: baseInput.email,
        tenantId: "tenant-001",
      }),
      signOut,
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
      hasWebAccessRole: async () => {
        throw new Error("web access lookup failed");
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

    expect(signOut).toHaveBeenCalledOnce();
  });
});
