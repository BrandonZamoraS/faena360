import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseAuthAdminAdapter } from "./SupabaseAuthAdminAdapter";

interface CreateUserSpyPayload {
  readonly email: string;
  readonly password: string;
  readonly email_confirm: boolean;
  readonly app_metadata: {
    readonly tenant_id: string;
  };
}

async function runAuthAdminAdapterContractChecks(): Promise<void> {
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

  expect(capturedCreatePayload).toBeDefined();
  expect(capturedCreatePayload?.email_confirm).toBe(true);
  expect(capturedCreatePayload?.app_metadata.tenant_id).toBe("tenant-1");

  await adapter.deleteUser("auth-user-id-1");

  expect(capturedDeleteUserId).toBe("auth-user-id-1");
}

async function runAuthAdminAdapterSqlFailureBehavior(): Promise<void> {
  let deleteUserCalled = false;

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
          deleteUserCalled = true;
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

  await expect(
    adapter.createUser({
      email: "tenant-user@example.com",
      temporaryPassword: "TempPass123!",
      app_metadata: {
        tenant_id: "tenant-1",
      },
    })
  ).rejects.toThrow("duplicate key value violates unique constraint");

  expect(deleteUserCalled).toBe(false);
}

describe("SupabaseAuthAdminAdapter", () => {
  it("passes tenant metadata to Supabase auth user creation", async () => {
    await runAuthAdminAdapterContractChecks();
  });

  it("propagates SQL errors from createUser failures", async () => {
    await runAuthAdminAdapterSqlFailureBehavior();
  });
});
