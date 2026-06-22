import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canAccessClientCatalogPage,
  canRunClientCatalogAction,
  renderClientCatalogShell,
} from "./page";

const clients = [
  {
    id: "client-1",
    tenant_id: "tenant-a",
    nombre: "Estancia La Esperanza",
    telefono: "15551112222",
    correo: "compras@esperanza.example",
    identificacion: "CUIT 30-12345678-9",
    direccion: "Ruta 8 km 120",
    estado: "activo" as const,
    created_at: "2026-06-17T00:00:00.000Z",
    updated_at: "2026-06-17T00:00:00.000Z",
  },
];

describe("clientes page shell", () => {
  it("renders the active tenant clients list for read-only sessions", () => {
    const html = renderToStaticMarkup(
      renderClientCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["clients:read"],
        clients,
      })
    );

    expect(html).toContain("Clientes");
    expect(html).toContain("Estancia La Esperanza");
    expect(html).toContain("compras@esperanza.example");
    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear cliente");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Ocultar cliente");
  });

  it("renders create, edit and hide controls only for write-capable sessions", () => {
    const html = renderToStaticMarkup(
      renderClientCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["clients:read", "clients:create", "clients:update"],
        clients,
      })
    );

    expect(html).toContain("Crear cliente");
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Ocultar cliente");
    expect(html).toContain('type="hidden" name="clientId" value="client-1"');
  });

  it("shows a useful empty state without exposing write controls to read-only users", () => {
    const html = renderToStaticMarkup(
      renderClientCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["clients:read"],
        clients: [],
      })
    );

    expect(html).toContain("Todavía no hay clientes activos.");
    expect(html).not.toContain("Crear cliente");
  });

  it("highlights active client module and keeps non-visible modules hidden", () => {
    const html = renderToStaticMarkup(
      renderClientCatalogShell({
        tenantName: "Tenant A",
        capabilities: [
          "clients:read",
          "projects:read",
          "users:create",
          "users:update",
          "fuel_types:read",
        ],
        clients: [],
      })
    );

    expect(html).toContain(
      'class="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white" href="/dashboard/clientes"'
    );
    expect(html).toContain(
      'class="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] transition hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f7044]" href="/dashboard/proyectos"'
    );
    expect(html).not.toContain('href="/dashboard/admin_usuarios"');
  });

  it("gates page access and direct server actions by effective capabilities", () => {
    expect(canAccessClientCatalogPage(["clients:read"])).toBe(true);
    expect(
      canAccessClientCatalogPage(["clients:create", "clients:update"])
    ).toBe(false);

    expect(
      canRunClientCatalogAction(
        ["clients:read", "clients:create"],
        "clients:create"
      )
    ).toBe(true);
    expect(
      canRunClientCatalogAction(["clients:create"], "clients:create")
    ).toBe(false);
    expect(
      canRunClientCatalogAction(
        ["clients:read", "clients:create"],
        "clients:update"
      )
    ).toBe(false);
  });
});
