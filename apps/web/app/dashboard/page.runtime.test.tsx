import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSession } from "@faena360/domain";
import {
  createDashboardViewModel,
  renderDashboardShell,
} from "./page";

const baseSession: AppSession = {
  user_id: "user-a",
  auth_user_id: "auth-user-a",
  tenant_id: "tenant-a",
  email: "admin@faena360.com",
  roles: ["admin"],
  effective_capabilities: ["web.portal.access"],
  status: "active",
  can_access_web: true,
};

describe("dashboard view model", () => {
  it("uses the tenant from the server session instead of editable params", async () => {
    const tenantLookup = vi.fn(async (tenantId: string) => ({
      id: tenantId,
      name: tenantId === "tenant-a" ? "Tenant A" : "Tenant B",
      status: "active",
    }));

    const viewModel = await createDashboardViewModel({
      session: baseSession,
      searchParams: { tenant_id: "tenant-b" },
      tenantLookup,
    });

    expect(tenantLookup).toHaveBeenCalledWith("tenant-a");
    expect("redirectTo" in viewModel).toBe(false);
    if ("redirectTo" in viewModel) {
      throw new Error("Expected dashboard context");
    }
    expect(viewModel.tenantName).toBe("Tenant A");
    expect(viewModel.userEmail).toBe("admin@faena360.com");
  });

  it("marks invalid sessions for login redirect", async () => {
    const viewModel = await createDashboardViewModel({
      session: null,
      searchParams: {},
      tenantLookup: vi.fn(),
    });

    expect("redirectTo" in viewModel).toBe(true);
    if (!("redirectTo" in viewModel)) {
      throw new Error("Expected redirect view model");
    }
    expect(viewModel.redirectTo).toBe("/");
  });
});

describe("dashboard shell", () => {
  it("renders tenant context and an empty state for future modules", () => {
    const html = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "admin@faena360.com",
        roles: ["admin"],
        effectiveCapabilities: ["web.portal.access"],
      })
    );

    expect(html).toContain("Tenant A");
    expect(html).toContain("admin@faena360.com");
    expect(html).toContain("No hay módulos operativos publicados todavía.");
  });

  it("shows the admin_usuarios module only when user write capabilities are present", () => {
    const adminHtml = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "admin@faena360.com",
        roles: ["admin"],
        effectiveCapabilities: [
          "web.portal.access",
          "users:read",
          "users:create",
          "users:update",
        ],
      })
    );
    const supervisorHtml = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "supervisor@faena360.com",
        roles: ["supervisor"],
        effectiveCapabilities: ["web.portal.access", "users:read"],
      })
    );

    expect(adminHtml).toContain("admin_usuarios");
    expect(adminHtml).toContain("Crear y administrar usuarios");
    expect(supervisorHtml).not.toContain("admin_usuarios");
  });

  it("renders a logout action in the authenticated sidebar", () => {
    const html = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "admin@faena360.com",
        roles: ["admin"],
        effectiveCapabilities: ["web.portal.access"],
      })
    );

    expect(html).toContain("Cerrar sesión");
  });
});
