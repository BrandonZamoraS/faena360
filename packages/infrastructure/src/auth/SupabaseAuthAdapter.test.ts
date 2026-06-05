import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAuthAdapter } from "./SupabaseAuthAdapter";

type SupabaseAuthQuery = {
  signInWithPassword: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
};

function createClient(): {
  client: SupabaseClient;
  auth: SupabaseAuthQuery;
} {
  const auth: SupabaseAuthQuery = {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  };

  const client = {
    auth,
  } as unknown as SupabaseClient;

  return { client, auth };
}

describe("SupabaseAuthAdapter", () => {
  it("signInWithPassword returns mapped AuthUser with tenant_id metadata", async () => {
    const { client, auth } = createClient();

    auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "auth-id",
          email: "alice@example.com",
          app_metadata: {
            tenant_id: " tenant-001 ",
          },
        },
      },
      error: null,
    });

    const adapter = new SupabaseAuthAdapter(client);
    const user = await adapter.signInWithPassword({
      email: "alice@example.com",
      password: "secret",
    });

    expect(user).toEqual({
      id: "auth-id",
      email: "alice@example.com",
      tenantId: "tenant-001",
    });
  });

  it("does not fall back to tenant metadata camelCase", async () => {
    const { client, auth } = createClient();

    auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "auth-id",
          email: "alice@example.com",
          app_metadata: {
            tenantId: "tenant-camel",
          },
        },
      },
      error: null,
    });

    const adapter = new SupabaseAuthAdapter(client);
    const user = await adapter.signInWithPassword({
      email: "alice@example.com",
      password: "secret",
    });

    expect(user.tenantId).toBeUndefined();
  });

  it("uses input email when Supabase user email is unavailable", async () => {
    const { client, auth } = createClient();

    auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "auth-id",
          app_metadata: {
            tenant_id: "tenant-001",
          },
        },
      },
      error: null,
    });

    const adapter = new SupabaseAuthAdapter(client);
    const user = await adapter.signInWithPassword({
      email: "fallback@example.com",
      password: "secret",
    });

    expect(user.email).toBe("fallback@example.com");
  });

  it("throws when Supabase signIn returns an error", async () => {
    const { client, auth } = createClient();

    auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid credentials" },
    });

    const adapter = new SupabaseAuthAdapter(client);

    await expect(
      adapter.signInWithPassword({
        email: "alice@example.com",
        password: "wrong",
      })
    ).rejects.toThrow("Invalid credentials");
  });

  it("throws when both user email and input email are missing", async () => {
    const { client, auth } = createClient();

    auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "auth-id",
          app_metadata: {
            tenant_id: "tenant-001",
          },
        },
      },
      error: null,
    });

    const adapter = new SupabaseAuthAdapter(client);

    await expect(
      adapter.signInWithPassword({
        email: "",
        password: "secret",
      })
    ).rejects.toThrow("Authenticated user has no email");
  });

  it("signOut delegates to Supabase auth signOut", async () => {
    const { client, auth } = createClient();

    auth.signOut.mockResolvedValue({ error: null });

    const adapter = new SupabaseAuthAdapter(client);

    await expect(adapter.signOut()).resolves.toBeUndefined();

    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("throws when Supabase signOut fails", async () => {
    const { client, auth } = createClient();

    auth.signOut.mockResolvedValue({ error: { message: "Sign-out failed" } });

    const adapter = new SupabaseAuthAdapter(client);

    await expect(adapter.signOut()).rejects.toThrow("Sign-out failed");
  });
});
