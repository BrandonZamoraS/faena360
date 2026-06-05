import type {
  AuthIdentityPort,
  AuthUser,
  LoginInput,
} from "@faena360/application";
import type { SupabaseClient } from "@supabase/supabase-js";

const WEB_TENANT_META_KEY = "tenant_id";
const APP_TENANT_META_KEY = "tenantId";

/**
 * Adapter around Supabase Auth for the application's identity contract.
 */
export class SupabaseAuthAdapter implements AuthIdentityPort {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Signs in with credentials and extracts tenant binding from app metadata.
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

  private extractTenantId(appMetadata: unknown): string | undefined {
    if (!appMetadata || typeof appMetadata !== "object") {
      return undefined;
    }

    const rawMetadata = appMetadata as Record<string, unknown>;
    const rawTenantId =
      rawMetadata[WEB_TENANT_META_KEY] ?? rawMetadata[APP_TENANT_META_KEY];

    if (typeof rawTenantId !== "string") {
      return undefined;
    }

    const tenantId = rawTenantId.trim();
    return tenantId.length > 0 ? tenantId : undefined;
  }
}
