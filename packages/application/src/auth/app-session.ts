import type {
  AuthIdentityPort,
  AppSessionRepository,
  AuthUser,
  LoginInput,
  LoginWithEmailPasswordOutcome,
  LoginWithEmailPasswordService,
} from "./index";
import {
  createEffectiveCapabilitiesResolver,
  type EffectiveCapabilitiesRepository,
} from "./effective-capabilities";

const WEB_ACCESS_CAPABILITY = "web.portal.access";

export class LoginWithEmailPasswordServiceImpl implements LoginWithEmailPasswordService {
  private readonly capabilityResolver: ReturnType<
    typeof createEffectiveCapabilitiesResolver
  >;

  constructor(
    private readonly authIdentityPort: AuthIdentityPort,
    private readonly appSessionRepository: AppSessionRepository
  ) {
    const repositoryAdapter: EffectiveCapabilitiesRepository = {
      listUserRoleIds: ({ tenantId, userId }) =>
        appSessionRepository.listUserRoles({ tenantId, userId }),
      listCapabilitiesForRoles: ({ tenantId, roleIds }) =>
        appSessionRepository.listTenantRoleCapabilities({ tenantId, roleIds }),
      listUserCapabilityOverrides: ({ tenantId, userId }) =>
        appSessionRepository.listUserCapabilityOverrides({ tenantId, userId }),
    };

    this.capabilityResolver = createEffectiveCapabilitiesResolver({
      repository: repositoryAdapter,
    });
  }

  async login(input: LoginInput): Promise<LoginWithEmailPasswordOutcome> {
    let authUser: AuthUser;

    try {
      authUser = await this.authIdentityPort.signInWithPassword(input);
    } catch {
      return { ok: false, code: "invalid_credentials" };
    }

    const tenantId = authUser.tenantId?.trim();
    if (!tenantId) {
      return {
        ok: false,
        code: "missing_tenant",
      };
    }

    let tenant: { readonly id: string; readonly status: string };
    try {
      tenant = await this.appSessionRepository.getTenant({ tenantId });
    } catch {
      return {
        ok: false,
        code: "inactive_tenant",
      };
    }

    if (tenant.status !== "active") {
      return {
        ok: false,
        code: "inactive_tenant",
      };
    }

    let userProfile: {
      readonly userId: string;
      readonly email: string;
      readonly status: "active" | "inactive";
      readonly tenantId: string;
    } | null;
    try {
      userProfile = await this.appSessionRepository.getUserProfile({
        tenantId,
        authUserId: authUser.id,
      });
    } catch {
      return {
        ok: false,
        code: "inactive_user",
      };
    }

    if (!userProfile || userProfile.status !== "active") {
      return {
        ok: false,
        code: "inactive_user",
      };
    }

    let roles: readonly string[];
    try {
      roles = await this.appSessionRepository.listUserRoles({
        tenantId,
        userId: userProfile.userId,
      });
    } catch {
      return {
        ok: false,
        code: "web_access_denied",
      };
    }

    let effectiveCapabilities: readonly string[];
    try {
      const resolved = await this.capabilityResolver.getEffectiveCapabilities({
        tenantId,
        userId: userProfile.userId,
      });
      effectiveCapabilities = Array.from(resolved.capabilities);
    } catch {
      return {
        ok: false,
        code: "web_access_denied",
      };
    }

    let hasWebAccessRole: boolean;
    try {
      hasWebAccessRole = await this.appSessionRepository.hasWebAccessRole({
        tenantId,
        userId: userProfile.userId,
        roleIds: roles,
      });
    } catch {
      return {
        ok: false,
        code: "web_access_denied",
      };
    }

    if (!hasWebAccessRole) {
      return {
        ok: false,
        code: "web_access_denied",
      };
    }

    if (!effectiveCapabilities.includes(WEB_ACCESS_CAPABILITY)) {
      return {
        ok: false,
        code: "web_access_denied",
      };
    }

    return {
      ok: true,
      session: {
        user_id: userProfile.userId,
        auth_user_id: authUser.id,
        tenant_id: tenant.id,
        email: userProfile.email,
        roles,
        effective_capabilities: effectiveCapabilities,
        status: userProfile.status,
      },
    };
  }
}
