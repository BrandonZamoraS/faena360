import type { AuthAdminPort } from "@faena360/domain";

interface CreateUserInput {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly app_metadata: {
    readonly tenant_id: string;
  };
}

interface SupabaseCreateUserPayload {
  readonly email: string;
  readonly password: string;
  readonly email_confirm: boolean;
  readonly app_metadata: {
    readonly tenant_id: string;
  };
}

interface SupabaseAuthUser {
  readonly id: string;
  readonly app_metadata?: {
    readonly tenant_id?: unknown;
    [key: string]: unknown;
  };
}

type SupabaseAuthError = { readonly message: string };

interface SupabaseAuthAdminResponse {
  readonly data: {
    readonly user?: SupabaseAuthUser | null;
    readonly [key: string]: unknown;
  } | null;
  readonly error: SupabaseAuthError | null;
}

interface SupabaseAuthAdminApi {
  readonly createUser: (
    input: SupabaseCreateUserPayload
  ) => Promise<SupabaseAuthAdminResponse>;
  readonly deleteUser: (
    authUserId: string
  ) => Promise<{ readonly error: SupabaseAuthError | null }>;
}

interface SupabaseAuthAdminClient {
  readonly auth: {
    readonly admin: SupabaseAuthAdminApi;
  };
}

export interface SupabaseAuthAdminAdapterDependencies {
  readonly client: SupabaseAuthAdminClient;
}

/**
 * Adaptador de la API administrativa de Supabase Auth para el puerto de dominio.
 *
 * Separa el contrato de User Management de cómo Supabase devuelve payloads,
 * y valida que la metadata del tenant se persistió antes de confirmar la
 * creación.
 */

export class SupabaseAuthAdminAdapter implements AuthAdminPort {
  private readonly client: SupabaseAuthAdminClient;

  public constructor(dependencies: SupabaseAuthAdminAdapterDependencies) {
    this.client = dependencies.client;
  }

  public async createUser(
    input: CreateUserInput
  ): Promise<{ readonly authUserId: string }> {
    // Creamos al usuario remoto y validamos que venga con tenant_id para evitar
    // identidades huérfanas entre Auth y perfil local.
    const response = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.temporaryPassword,
      email_confirm: true,
      app_metadata: {
        tenant_id: input.app_metadata.tenant_id,
      },
    });

    const { data, error } = response;

    if (error) {
      throw new Error(formatSupabaseError(error));
    }

    const createdUser = response.data?.user as
      | SupabaseAuthUser
      | null
      | undefined;

    if (!createdUser?.id) {
      throw new Error("Auth identity creation did not return a user id.");
    }

    if (createdUser.app_metadata?.tenant_id !== input.app_metadata.tenant_id) {
      await this.deleteUser(createdUser.id);
      throw new Error(
        "Auth identity creation did not persist tenant metadata."
      );
    }

    return {
      authUserId: createdUser.id,
    };
  }

  public async deleteUser(authUserId: string): Promise<void> {
    // Operación de compensación para rollback de creación parcial en Application.
    const response = await this.client.auth.admin.deleteUser(authUserId);
    if (response.error) {
      throw new Error(formatSupabaseError(response.error));
    }
  }
}

function formatSupabaseError(error: SupabaseAuthError): string {
  // Conserva un texto consistente incluso cuando la forma exacta del error
  // cambia entre versiones de SDK.
  return "message" in error ? error.message : "Supabase auth request failed.";
}
