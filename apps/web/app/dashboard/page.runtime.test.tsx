import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSession } from "@faena360/domain";
import { createDashboardViewModel, renderDashboardShell } from "./page";

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

  it("keeps the dashboard gated by web access and portal capability", async () => {
    const tenantLookup = vi.fn(async (tenantId: string) => ({
      id: tenantId,
      name: "Tenant A",
      status: "active",
    }));

    const withoutWebAccess = await createDashboardViewModel({
      session: { ...baseSession, can_access_web: false },
      searchParams: {},
      tenantLookup,
    });
    const withoutPortalAccess = await createDashboardViewModel({
      session: { ...baseSession, effective_capabilities: [] },
      searchParams: {},
      tenantLookup,
    });

    expect(withoutWebAccess).toEqual({ redirectTo: "/" });
    expect(withoutPortalAccess).toEqual({ redirectTo: "/" });
    expect(tenantLookup).not.toHaveBeenCalled();
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

  it("marks the dashboard route as active in shared sidebar", () => {
    const html = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "admin@faena360.com",
        roles: ["admin"],
        effectiveCapabilities: ["web.portal.access", "clients:read"],
      })
    );

    expect(html).toContain(
      'class="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white" href="/dashboard"'
    );
    expect(html).toContain(
      'class="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] transition hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f7044]" href="/dashboard/clientes"'
    );
  });

  it("keeps module visibility and highlights the provided active route", () => {
    const html = renderToStaticMarkup(
      renderDashboardShell(
        {
          tenantName: "Tenant A",
          userEmail: "admin@faena360.com",
          roles: ["admin"],
          effectiveCapabilities: [
            "web.portal.access",
            "clients:read",
            "fuel_types:read",
            "categories:read",
          ],
        },
        "/dashboard/clientes"
      )
    );

    expect(html).toContain(
      'class="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white" href="/dashboard/clientes"'
    );
    expect(html).toContain(
      'class="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] transition hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f7044]" href="/dashboard/tipos_combustible"'
    );
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

    const delegatedCreatorHtml = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "creator@faena360.com",
        roles: ["delegated_creator"],
        effectiveCapabilities: [
          "web.portal.access",
          "users:read",
          "users:create",
        ],
      })
    );
    expect(delegatedCreatorHtml).toContain("admin_usuarios");
  });

  it("renders catalog-like module links from current read capabilities", () => {
    const html = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "catalog-reader@faena360.com",
        roles: ["supervisor"],
        effectiveCapabilities: [
          "web.portal.access",
          "clients:read",
          "categories:read",
          "fuel_types:read",
        ],
      })
    );

    expect(html).toContain('href="/dashboard/clientes"');
    expect(html).toContain('href="/dashboard/categorias_gastos"');
    expect(html).toContain('href="/dashboard/tipos_combustible"');
    expect(html).not.toContain('href="/dashboard/proyectos"');
    expect(html).not.toContain('href="/dashboard/admin_usuarios"');
  });

  it("hides catalog-like modules without their read capability", () => {
    const html = renderToStaticMarkup(
      renderDashboardShell({
        tenantName: "Tenant A",
        userEmail: "project-reader@faena360.com",
        roles: ["custom"],
        effectiveCapabilities: ["web.portal.access", "projects:read"],
      })
    );

    expect(html).toContain('href="/dashboard/proyectos"');
    expect(html).not.toContain('href="/dashboard/clientes"');
    expect(html).not.toContain('href="/dashboard/categorias_gastos"');
    expect(html).not.toContain('href="/dashboard/tipos_combustible"');
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
