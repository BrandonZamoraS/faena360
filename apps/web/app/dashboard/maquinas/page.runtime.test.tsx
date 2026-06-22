import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderMachineCatalogShell } from "./page";

const fuelTypes = [
  {
    id: "fuel-1",
    tenant_id: "tenant-a",
    nombre: "Diésel",
    estado: "activo" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];

const machines = [
  {
    id: "machine-1",
    tenant_id: "tenant-a",
    codigo: "MAQ-001",
    placa: "ABC123",
    tipo: "acarreo" as const,
    tipo_combustible_id: "fuel-1",
    tamanio_tanque: 250,
    modo_medicion_combustible: "exacto" as const,
    nivel_inicial_combustible: 125,
    capacidad_transporte_m3: 18,
    tarifa_sugerida: 45000,
    estado: "activa" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];

describe("maquinas page shell", () => {
  it("renders create, edit, and status controls for administrator sessions", () => {
    const html = renderToStaticMarkup(
      renderMachineCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: [
          "machines:read",
          "machines:create",
          "machines:update",
          "machines:change_status",
          "fuel_types:read",
        ],
        machines,
        fuelTypes,
      })
    );

    expect(html).toContain("Máquinas");
    expect(html).toContain("Crear máquina");
    expect(html).toContain("MAQ-001");
    expect(html).toContain('value="MAQ-001"');
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Cambiar estado");
    expect(html).toContain("Ocultar máquina");
    expect(html).toContain('name="capacidad_transporte_m3"');
    expect(html).toContain('name="capacidad_transporte_m3"');
    expect(html).toContain('min="0.01"');
    expect(html).toContain('href="/dashboard/maquinas"');
  });

  it("shows supervisor and read-only sessions without mutation controls", () => {
    const html = renderToStaticMarkup(
      renderMachineCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["machines:read"],
        machines,
        fuelTypes,
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).toContain("MAQ-001");
    expect(html).toContain("Sin acceso al catálogo de combustible.");
    expect(html).not.toContain("Diésel");
    expect(html).not.toContain("Crear máquina");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Cambiar estado");
    expect(html).not.toContain("Ocultar máquina");
  });

  it("requires fuel_types:read before exposing machine create or edit fuel controls", () => {
    const html = renderToStaticMarkup(
      renderMachineCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["machines:read", "machines:create", "machines:update"],
        machines,
        fuelTypes,
      })
    );

    expect(html).toContain("Necesitás acceso al catálogo de combustible");
    expect(html).not.toContain("Crear máquina");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Diésel");
  });

  it("preserves the currently selected hidden fuel type while editing a machine", () => {
    const html = renderToStaticMarkup(
      renderMachineCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["machines:read", "machines:update", "fuel_types:read"],
        machines: [
          {
            ...machines[0],
            tipo_combustible_id: "fuel-hidden",
          },
        ],
        fuelTypes: [
          fuelTypes[0],
          {
            id: "fuel-hidden",
            tenant_id: "tenant-a",
            nombre: "Gasolina legacy",
            estado: "oculto" as const,
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
          },
        ],
      })
    );

    expect(html).toContain('value="fuel-hidden" selected');
    expect(html).toContain("Gasolina legacy (oculto)");
  });

  it("keeps edit controls available when the current hidden fuel type is still selectable", () => {
    const html = renderToStaticMarkup(
      renderMachineCatalogShell({
        tenantName: "Tenant Demo",
        capabilities: ["machines:read", "machines:update", "fuel_types:read"],
        machines: [
          {
            ...machines[0],
            tipo_combustible_id: "fuel-hidden",
          },
        ],
        fuelTypes: [
          {
            id: "fuel-hidden",
            tenant_id: "tenant-a",
            nombre: "Gasolina legacy",
            estado: "oculto" as const,
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z",
          },
        ],
      })
    );

    expect(html).toContain("Guardar cambios");
    expect(html).not.toContain(
      "Necesitás al menos un tipo de combustible activo para crear o editar máquinas."
    );
  });
});
