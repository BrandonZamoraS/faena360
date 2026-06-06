
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
  readonly createUser: (input: SupabaseCreateUserPayload) => Promise<SupabaseAuthAdminResponse>;
  readonly deleteUser: (authUserId: string) => Promise<{ readonly error: SupabaseAuthError | null }>;
}

interface SupabaseAuthAdminClient {
  readonly auth: {
    readonly admin: SupabaseAuthAdminApi;
  };
}

export interface SupabaseAuthAdminAdapterDependencies {
  readonly client: SupabaseAuthAdminClient;
}

export class SupabaseAuthAdminAdapter implements AuthAdminPort {
  private readonly client: SupabaseAuthAdminClient;

  public constructor(dependencies: SupabaseAuthAdminAdapterDependencies) {
    this.client = dependencies.client;
  }

  public async createUser(input: CreateUserInput): Promise<{ readonly authUserId: string }> {
    const response = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.temporaryPassword,
      app_metadata: {
        tenant_id: input.app_metadata.tenant_id,
      },
    });

    const { data, error } = response;

    if (error) {
      throw new Error(formatSupabaseError(error));
    }

    const createdUser = response.data?.user as SupabaseAuthUser | null | undefined;

    if (!createdUser?.id) {
      throw new Error("Auth identity creation did not return a user id.");
    }

    if (createdUser.app_metadata?.tenant_id !== input.app_metadata.tenant_id) {
      throw new Error("Auth identity creation did not persist tenant metadata.");
    }

    return {
      authUserId: createdUser.id,
    };
  }

  public async deleteUser(authUserId: string): Promise<void> {
    const response = await this.client.auth.admin.deleteUser(authUserId);
    if (response.error) {
      throw new Error(formatSupabaseError(response.error));
    }
  }
}

function formatSupabaseError(error: SupabaseAuthError): string {
  return "message" in error
    ? error.message
    : "Supabase auth request failed.";
}
