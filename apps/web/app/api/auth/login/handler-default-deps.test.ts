import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const clients = vi.hoisted(() => ({
  anon: { kind: "anon" },
  service: { kind: "service" },
}));

vi.mock("../../../../lib/supabase", () => ({
  createWebSupabaseClient: vi.fn(() => clients.anon),
  createWebSupabaseServiceClient: vi.fn(() => clients.service),
}));

vi.mock("@faena360/infrastructure", () => ({
  SupabaseAuthAdapter: class {
    constructor(private readonly client: { kind: string }) {}

    async signInWithPassword() {
      if (this.client.kind !== "anon") {
        throw new Error("auth must use anon client");
      }

      return {
        id: "auth-user-id",
        email: "admin@acme.local",
        tenantId: "tenant-id",
      };
    }
  },
  SupabaseAppSessionRepository: class {
    constructor(private readonly client: { kind: string }) {}

    async getTenant() {
      return { id: "tenant-id", status: "active" };
    }

    async getUserProfile() {
      return {
        userId: "profile-id",
        email: "admin@acme.local",
        status: "active",
        tenantId: "tenant-id",
      };
    }

    async listUserRoles() {
      return ["admin-role-id"];
    }

    async listTenantRoleCapabilities() {
      return this.client.kind === "service" ? ["web.portal.access"] : [];
    }

    async listUserCapabilityOverrides() {
      return [];
    }

    async hasWebAccessRole() {
      return this.client.kind === "service";
    }
  },
}));

process.env.APP_SESSION_SECRET = "test-session-secret";

describe("POST /api/auth/login default dependencies", () => {
  it("uses service-role reads for authorization after anon authentication", async () => {
    const { handleLoginPost } = await import("./handler");
    const response = await handleLoginPost(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "admin@acme.local",
          password: "change-me-123",
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.session.can_access_web).toBe(true);
  });
});
