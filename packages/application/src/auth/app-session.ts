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

/**
 * Capa Application: caso de uso de login web.
 *
 * Orquesta puertos, no detalles de infraestructura: `AuthIdentityPort` autentica
 * contra el proveedor externo y `AppSessionRepository` lee el estado propio de
 * Faena360. Así el caso de uso expresa la política del negocio sin depender de
 * Supabase, tablas concretas ni rutas HTTP.
 */
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
      // Primero validamos identidad externa. Todavía no hay sesión de Faena360:
      // Supabase solo prueba credenciales y entrega el `tenantId` desde metadata.
      authUser = await this.authIdentityPort.signInWithPassword(input);
    } catch {
      return { ok: false, code: "invalid_credentials" };
    }

    const tenantId = authUser.tenantId?.trim();
    if (!tenantId) {
      // El tenant no viene del cliente porque sería falsificable. Si el proveedor
      // de identidad no lo trae en metadata confiable, no existe contexto seguro.
      await this.cleanupAuthIdentity();
      return { ok: false, code: "missing_tenant" };
    }

    let tenant: { readonly id: string; readonly status: string };
    try {
      // A partir de acá empieza la autorización propia de Faena360: tenant,
      // perfil, roles y capacidades viven en nuestra base, no en el formulario.
      tenant = await this.appSessionRepository.getTenant({ tenantId });
    } catch {
      await this.cleanupAuthIdentity();
      return {
        ok: false,
        code: "inactive_tenant",
      };
    }

    if (tenant.status !== "active") {
      await this.cleanupAuthIdentity();
      return {
        ok: false,
        code: "inactive_tenant",
      };
    }

    let userProfile: {
      readonly userId: string;
      readonly email?: string | null;
      readonly status: "active" | "inactive";
      readonly tenantId: string;
    } | null;
    try {
      userProfile = await this.appSessionRepository.getUserProfile({
        tenantId,
        authUserId: authUser.id,
      });
    } catch {
      await this.cleanupAuthIdentity();
      return {
        ok: false,
        code: "inactive_user",
      };
    }

    if (!userProfile || userProfile.status !== "active") {
      await this.cleanupAuthIdentity();
      return {
        ok: false,
        code: "inactive_user",
      };
    }

    const profileEmail = userProfile.email?.trim();
    const authEmail = authUser.email?.trim();
    const sessionEmail = profileEmail || authEmail;

    if (!sessionEmail) {
      await this.cleanupAuthIdentity();
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
      await this.cleanupAuthIdentity();
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
      await this.cleanupAuthIdentity();
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
      await this.cleanupAuthIdentity();
      return {
        ok: false,
        code: "web_access_denied",
      };
    }

    const canAccessWeb =
      hasWebAccessRole && effectiveCapabilities.includes(WEB_ACCESS_CAPABILITY);

    if (!canAccessWeb) {
      // Doble condición intencional: `is_web_access` habilita la familia de rol,
      // y `web.portal.access` permite revocar/otorgar acceso vía capacidades.
      // Una sin la otra no alcanza para entrar a la web.
      await this.cleanupAuthIdentity();
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
        email: sessionEmail,
        roles,
        effective_capabilities: effectiveCapabilities,
        status: userProfile.status,
        can_access_web: canAccessWeb,
      },
    };
  }

  private async cleanupAuthIdentity(): Promise<void> {
    if (!this.authIdentityPort.signOut) {
      return;
    }

    try {
      // Si la identidad externa fue válida pero la autorización local falla,
      // cerramos la sesión del proveedor para no dejar un login parcial vivo.
      await this.authIdentityPort.signOut();
    } catch {
      return;
    }
  }
}
