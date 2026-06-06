import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseAuthAdminAdapter } from "./SupabaseAuthAdminAdapter";

interface CreateUserSpyPayload {
  readonly email: string;
  readonly password: string;
  readonly app_metadata: {
    readonly tenant_id: string;
  };
}

export async function runAuthAdminAdapterContractChecks(): Promise<void> {
  let capturedCreatePayload: CreateUserSpyPayload | undefined;
  let capturedDeleteUserId: string | undefined;

  const client = {
    auth: {
      admin: {
        createUser: async (payload: CreateUserSpyPayload) => {
          capturedCreatePayload = payload;

          return {
            data: {
              user: {
                id: "auth-user-id-1",
                app_metadata: {
                  tenant_id: payload.app_metadata.tenant_id,
                },
              },
            },
            error: null,
          };
        },
        deleteUser: async (userId: string) => {
          capturedDeleteUserId = userId;

          return {
            data: null,
            error: null,
          };
        },
      },
    },
    from: () => {
      throw new Error(
        "Auth admin contract checks should not hit database queries."
      );
    },
  } as unknown as SupabaseClient;

  const adapter = new SupabaseAuthAdminAdapter({
    client,
  });

  await adapter.createUser({
    email: "tenant-user@example.com",
    temporaryPassword: "TempPass123!",
    app_metadata: {
      tenant_id: "tenant-1",
    },
  });

  if (!capturedCreatePayload) {
    throw new Error("Expected createUser to call Supabase auth createUser.");
  }

  if (capturedCreatePayload.app_metadata.tenant_id !== "tenant-1") {
    throw new Error("Expected createUser to pass tenant_id to app_metadata.");
  }

  await adapter.deleteUser("auth-user-id-1");

  if (capturedDeleteUserId !== "auth-user-id-1") {
    throw new Error("Expected deleteUser to forward exact auth user id.");
  }
}

export async function runAuthAdminAdapterSqlFailureBehavior(): Promise<void> {
  const client = {
    auth: {
      admin: {
        createUser: async () => {
          return {
            data: null,
            error: {
              message:
                'duplicate key value violates unique constraint "users_email_key"',
              details: "Key (email)=(tenant-user@example.com) already exists.",
              hint: "Remove duplicate email",
              code: "23505",
            },
          } as const;
        },
        deleteUser: async () => {
          throw new Error(
            "deleteUser should not be called when auth creation fails."
          );
        },
      },
    },
    from: () => {
      throw new Error(
        "Auth admin SQL failure path should not hit database queries."
      );
    },
  } as unknown as SupabaseClient;

  const adapter = new SupabaseAuthAdminAdapter({
    client,
  });

  let failedWithMessage: string | undefined;

  try {
    await adapter.createUser({
      email: "tenant-user@example.com",
      temporaryPassword: "TempPass123!",
      app_metadata: {
        tenant_id: "tenant-1",
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      failedWithMessage = error.message;
    }
  }

  if (!failedWithMessage) {
    throw new Error("Expected createUser to fail when SQL returns an error.");
  }

  if (
    !failedWithMessage.includes(
      "duplicate key value violates unique constraint"
    )
  ) {
    throw new Error(
      `Expected SQL-style error message to be propagated, got ${failedWithMessage}`
    );
  }
}
