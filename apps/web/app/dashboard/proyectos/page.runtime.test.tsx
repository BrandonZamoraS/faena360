import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  assertFinishConfirmation,
  canAccessProjectCatalogPage,
  canRunProjectCatalogAction,
  renderProjectCatalogShell,
} from "./page";

const clients = [
  {
    id: "client-1",
    tenant_id: "tenant-a",
    nombre: "Ganadera Norte",
    telefono: "555111222",
    correo: "gerencia@ganaderanorte.example",
    identificacion: "CUIT 30-20112233-1",
    direccion: "Ruta 40 km 77",
    estado: "activo" as const,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const projects = [
  {
    id: "project-1",
    tenant_id: "tenant-a",
    nombre: "Proyecto Lote 1",
    cliente_id: "client-1",
    ubicacion: "Sector Norte",
    fecha_inicio: "2026-06-01",
    fecha_finalizacion: null,
    forma_cobro: "monto_fijo" as const,
    monto_fijo: 1900,
    estado: "activo" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "project-2",
    tenant_id: "tenant-a",
    nombre: "Proyecto Lote 2",
    cliente_id: "client-1",
    ubicacion: "Sector Sur",
    fecha_inicio: "2026-05-15",
    fecha_finalizacion: "2026-06-15",
    forma_cobro: "por_dia" as const,
    monto_fijo: null,
    estado: "finalizado" as const,
    created_at: "2026-05-15T00:00:00.000Z",
    updated_at: "2026-06-15T00:00:00.000Z",
  },
];

describe("proyectos page shell", () => {
  it("renders visible projects for supervisor read-only sessions", () => {
    const html = renderToStaticMarkup(
      renderProjectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["projects:read"],
        projects,
        clients,
      })
    );

    expect(html).toContain("Proyectos");
    expect(html).toContain("Proyecto Lote 1");
    expect(html).toContain("Cliente: ID client-1");
    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear proyecto");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Pausar proyecto");
    expect(html).not.toContain("Finalizar proyecto");
    expect(html).not.toContain("Reabrir proyecto");
    expect(html).not.toContain("Ocultar proyecto");
  });

  it("renders create and lifecycle controls for administrator sessions", () => {
    const html = renderToStaticMarkup(
      renderProjectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "projects:read",
          "projects:create",
          "projects:update",
          "projects:pause",
          "projects:finish",
          "projects:reopen",
          "projects:hide",
          "clients:read",
        ],
        projects,
        clients,
      })
    );

    expect(html).toContain("Crear proyecto");
    expect(html).toContain('value="project-1"');
    expect(html).toContain("Pausar proyecto");
    expect(html).toContain("Finalizar proyecto");
    expect(html).toContain("Reabrir proyecto");
    expect(html).toContain("Ocultar proyecto");
    expect(html).toContain("Ganadera Norte");
    expect(html).toContain(
      "Confirmo que debo anular las jornadas abiertas afectadas"
    );
    expect(html).toContain(
      "Confirmo la finalización y la anulación de jornadas abiertas afectadas"
    );
  });

  it("hides client-dependent controls when clients read capability is missing", () => {
    const html = renderToStaticMarkup(
      renderProjectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["projects:read", "projects:create", "projects:update"],
        projects,
        clients: [],
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear proyecto");
    expect(html).not.toContain('select name="cliente_id"');
    expect(html).not.toContain("Guardar cambios");
  });

  it("renders lifecycle controls independently from update permission", () => {
    const html = renderToStaticMarkup(
      renderProjectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["projects:read", "projects:finish", "projects:hide"],
        projects,
        clients,
      })
    );

    expect(html).not.toContain("Guardar cambios");
    expect(html).toContain("Finalizar proyecto");
    expect(html).toContain("Ocultar proyecto");
  });

  it("preserves finalized project dates in edit submissions", () => {
    const html = renderToStaticMarkup(
      renderProjectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["projects:read", "projects:update", "clients:read"],
        projects,
        clients,
      })
    );

    expect(html).toContain('name="fecha_finalizacion"');
    expect(html).toContain('value="2026-06-15"');
  });

  it("requires confirmation before finishing a project", () => {
    expect(() => assertFinishConfirmation(new FormData())).toThrow(
      "missing_finish_confirmation"
    );

    const formData = new FormData();
    formData.set("confirmation", "true");

    expect(() => assertFinishConfirmation(formData)).not.toThrow();
  });

  it("highlights the active project module in the sidebar", () => {
    const html = renderToStaticMarkup(
      renderProjectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["projects:read", "clients:read", "fuel_types:read"],
        projects: [],
        clients,
      })
    );

    expect(html).toContain(
      'class="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white" href="/dashboard/proyectos"'
    );
    expect(html).toContain('href="/dashboard/clientes"');
    expect(html).toContain('href="/dashboard/tipos_combustible"');
  });

  it("keeps action gates based on capability logic", () => {
    expect(canAccessProjectCatalogPage(["projects:read"])).toBe(true);
    expect(canAccessProjectCatalogPage(["projects:create"])).toBe(false);

    expect(
      canRunProjectCatalogAction(
        ["projects:read", "projects:create"],
        "projects:create"
      )
    ).toBe(true);
    expect(
      canRunProjectCatalogAction(["projects:create"], "projects:create")
    ).toBe(false);
    expect(
      canRunProjectCatalogAction(
        ["projects:read", "projects:update"],
        "projects:pause"
      )
    ).toBe(false);
  });
});
