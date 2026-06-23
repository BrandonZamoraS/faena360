import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  assertFinishConfirmation,
  canAccessSubprojectCatalogPage,
  canRunSubprojectCatalogAction,
  renderSubprojectCatalogShell,
} from "./page";

const projects = [
  {
    id: "proj-1",
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
    id: "proj-2",
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

const subprojects = [
  {
    id: "sub-1",
    tenant_id: "tenant-a",
    proyecto_id: "proj-1",
    nombre: "Fase 1",
    ubicacion: "Sector Norte",
    forma_cobro: "monto_fijo" as const,
    monto_fijo: 500,
    estado: "activo" as const,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
  },
  {
    id: "sub-2",
    tenant_id: "tenant-a",
    proyecto_id: "proj-1",
    nombre: "Fase 2",
    ubicacion: null,
    forma_cobro: null,
    monto_fijo: null,
    estado: "finalizado" as const,
    created_at: "2026-06-05T00:00:00.000Z",
    updated_at: "2026-06-12T00:00:00.000Z",
  },
];

describe("subprojects page shell", () => {
  it("renders visible subprojects for supervisor read-only sessions", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["subprojects:read"],
        subprojects,
        projects: [],
      })
    );

    expect(html).toContain("Subproyectos");
    expect(html).toContain("Fase 1");
    expect(html).toContain("Proyecto: ID proj-1");
    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear subproyecto");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Finalizar subproyecto");
    expect(html).not.toContain("Reabrir subproyecto");
    expect(html).not.toContain("Ocultar subproyecto");
  });

  it("renders create and lifecycle controls for administrator sessions", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "subprojects:read",
          "subprojects:create",
          "subprojects:update",
          "subprojects:finish",
          "subprojects:reopen",
          "subprojects:hide",
          "projects:read",
        ],
        subprojects,
        projects,
      })
    );

    expect(html).toContain("Crear subproyecto");
    expect(html).toContain('value="sub-1"');
    expect(html).toContain("Finalizar subproyecto");
    expect(html).toContain("Reabrir subproyecto");
    expect(html).toContain("Ocultar subproyecto");
    expect(html).toContain("Proyecto Lote 1");
    expect(html).toContain(
      "Confirmo la finalización y la anulación de jornadas abiertas afectadas"
    );
  });

  it("hides create form when projects:read capability is missing", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "subprojects:read",
          "subprojects:create",
          "subprojects:update",
        ],
        subprojects,
        projects: [],
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear subproyecto");
    expect(html).not.toContain('name="proyecto_id"');
  });

  it("renders lifecycle controls independently from update permission", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "subprojects:read",
          "subprojects:finish",
          "subprojects:hide",
        ],
        subprojects,
        projects,
      })
    );

    expect(html).not.toContain("Guardar cambios");
    expect(html).toContain("Finalizar subproyecto");
    expect(html).toContain("Ocultar subproyecto");
  });

  it("shows project names when projects:read is available", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["subprojects:read", "projects:read"],
        subprojects,
        projects,
      })
    );

    expect(html).toContain("Proyecto: Proyecto Lote 1");
    expect(html).not.toContain("Proyecto: ID proj-1");
  });

  it("renders nullable fields correctly when absent", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "subprojects:read",
          "subprojects:update",
          "projects:read",
        ],
        subprojects,
        projects,
      })
    );

    // sub-2 has null ubicacion and null forma_cobro
    expect(html).toContain('value="Fase 2"');
    // The ubicacion line should NOT appear for sub-2
    expect(html).not.toContain("Ubicación: null");
  });

  it("requires confirmation before finishing a subproject", () => {
    expect(() => assertFinishConfirmation(new FormData())).toThrow(
      "missing_finish_confirmation"
    );

    const formData = new FormData();
    formData.set("confirmation", "true");

    expect(() => assertFinishConfirmation(formData)).not.toThrow();
  });

  it("highlights the active subproject module in the sidebar", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "subprojects:read",
          "projects:read",
          "fuel_types:read",
        ],
        subprojects: [],
        projects,
      })
    );

    expect(html).toContain(
      'class="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white" href="/dashboard/subprojects"'
    );
    expect(html).toContain('href="/dashboard/proyectos"');
  });

  it("keeps action gates based on capability logic", () => {
    expect(canAccessSubprojectCatalogPage(["subprojects:read"])).toBe(true);
    expect(canAccessSubprojectCatalogPage(["subprojects:create"])).toBe(false);

    expect(
      canRunSubprojectCatalogAction(
        ["subprojects:read", "subprojects:create"],
        "subprojects:create"
      )
    ).toBe(true);
    expect(
      canRunSubprojectCatalogAction(
        ["subprojects:create"],
        "subprojects:create"
      )
    ).toBe(false);
    expect(
      canRunSubprojectCatalogAction(
        ["subprojects:read", "subprojects:update"],
        "subprojects:finish"
      )
    ).toBe(false);
  });

  it("renders reopened target estado selector for finalized subprojects", () => {
    const html = renderToStaticMarkup(
      renderSubprojectCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["subprojects:read", "subprojects:reopen"],
        subprojects,
        projects,
      })
    );

    // sub-2 is finalized, so reopen form should appear for it
    expect(html).toContain("Reabrir como");
    expect(html).toContain('value="activo"');
    expect(html).toContain('value="pausado"');
    expect(html).toContain("Reabrir subproyecto");
  });
});
