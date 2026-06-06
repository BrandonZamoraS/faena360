import type {
  AuthIdentityPort,
  AuthUser,
  LoginInput,
} from "@faena360/application";
import type { SupabaseClient } from "@supabase/supabase-js";

const WEB_TENANT_META_KEY = "tenant_id";

/**
 * Adapter de Supabase Auth para el puerto de identidad de la capa Application.
 */
export class SupabaseAuthAdapter implements AuthIdentityPort {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Realiza login con email/password y extrae tenant desde app metadata.
   */
  async signInWithPassword(input: LoginInput): Promise<AuthUser> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error || !data?.user) {
      throw error ?? new Error("Invalid credentials");
    }

    const tenantId = this.extractTenantId(data.user.app_metadata);
    const email = data.user.email ?? input.email;

    if (!email) {
      throw new Error("Authenticated user has no email");
    }

    return {
      id: data.user.id,
      email,
      tenantId,
    };
  }

  /**
   * Cierra la sesión de Supabase para limpiar estado local de identidad.
   */
  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({
      scope: "local",
    });

    if (error) {
      throw error;
    }
  }

  private extractTenantId(appMetadata: unknown): string | undefined {
    // Validamos estrictamente la metadata porque tenantId es la raíz del contexto
    // de sesión; si no existe de forma confiable, abortamos el login.
    if (!appMetadata || typeof appMetadata !== "object") {
      return undefined;
    }

    const rawMetadata = appMetadata as Record<string, unknown>;
    const rawTenantId = rawMetadata[WEB_TENANT_META_KEY];

    if (typeof rawTenantId !== "string") {
      return undefined;
    }

    const tenantId = rawTenantId.trim();
    return tenantId.length > 0 ? tenantId : undefined;
  }
}
