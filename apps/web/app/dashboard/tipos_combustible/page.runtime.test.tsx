import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canAccessFuelTypeCatalogPage,
  canRunFuelTypeCatalogAction,
  renderFuelTypeCatalogShell,
} from "./page";

describe("tipos_combustible page shell", () => {
  it("renders create, edit, and hide controls for authorized users", () => {
    const html = renderToStaticMarkup(
      renderFuelTypeCatalogShell({
        tenantName: "Tenant A",
        capabilities: [
          "fuel_types:read",
          "fuel_types:create",
          "fuel_types:update",
        ],
        fuelTypes: [
          {
            id: "fuel-type-1",
            tenant_id: "tenant-a",
            nombre: "Diésel",
            estado: "activo",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      })
    );

    expect(html).toContain("Tipos de combustible");
    expect(html).toContain("Crear tipo de combustible");
    expect(html).toContain("Diésel");
    expect(html).toContain('value="Diésel"');
    expect(html).not.toContain("Diésel actualizado");
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Ocultar tipo de combustible");
  });

  it("shows read-only shell without mutation controls", () => {
    const html = renderToStaticMarkup(
      renderFuelTypeCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["fuel_types:read"],
        fuelTypes: [],
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear tipo de combustible");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Ocultar tipo de combustible");
  });

  it("hides shell without fuel_types read capability", () => {
    const html = renderToStaticMarkup(
      renderFuelTypeCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["users:read"],
        fuelTypes: [],
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear tipo de combustible");
  });

  it("requires read to access and action run gates", () => {
    expect(canAccessFuelTypeCatalogPage(["fuel_types:read"])).toBe(true);
    expect(canAccessFuelTypeCatalogPage(["fuel_types:create"])).toBe(false);

    expect(
      canRunFuelTypeCatalogAction(["fuel_types:create"], "fuel_types:create")
    ).toBe(false);
    expect(
      canRunFuelTypeCatalogAction(
        ["fuel_types:read", "fuel_types:create"],
        "fuel_types:create"
      )
    ).toBe(true);

    expect(
      canRunFuelTypeCatalogAction(
        ["fuel_types:read", "fuel_types:create"],
        "fuel_types:update"
      )
    ).toBe(false);
  });
});
