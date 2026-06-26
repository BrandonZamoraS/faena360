import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderAssignmentsShell } from "./page";

const machines = [
  {
    id: "machine-1",
    tenant_id: "tenant-a",
    codigo: "MAQ-001",
    placa: "ABC123",
    tipo: "por_tiempo" as const,
    tipo_combustible_id: "fuel-1",
    tamanio_tanque: 250,
    modo_medicion_combustible: "exacto" as const,
    nivel_inicial_combustible: 125,
    capacidad_transporte_m3: null,
    tarifa_sugerida: 15000,
    estado: "activa" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "machine-2",
    tenant_id: "tenant-a",
    codigo: "MAQ-002",
    placa: "DEF456",
    tipo: "por_tiempo" as const,
    tipo_combustible_id: "fuel-1",
    tamanio_tanque: 250,
    modo_medicion_combustible: "exacto" as const,
    nivel_inicial_combustible: 125,
    capacidad_transporte_m3: null,
    tarifa_sugerida: 20000,
    estado: "activa" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];

const projects = [
  {
    id: "project-1",
    tenant_id: "tenant-a",
    nombre: "Proyecto Demo",
    cliente_id: "client-1",
    ubicacion: "Buenos Aires",
    fecha_inicio: "2026-01-01",
    fecha_finalizacion: null,
    forma_cobro: "por_horas" as const,
    monto_fijo: null,
    estado: "activo" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];

const operators = [
  { id: "user-1", full_name: "Juan Operador" },
  { id: "user-2", full_name: "María Operadora" },
];

const assignments = [
  {
    id: "assignment-1",
    maquina_id: "machine-1",
    proyecto_id: "project-1",
    subproyecto_id: null,
    operador_id: "user-1",
    tarifa_aplicada: 15000,
    estado: "activa",
    fecha_inicio: "2026-06-23T10:00:00.000Z",
    fecha_fin: null,
    maquina_codigo: "MAQ-001",
    proyecto_nombre: "Proyecto Demo",
    operador_full_name: "Juan Operador",
  },
];

describe("assignments page shell", () => {
  it("renders create form and action buttons for administrator sessions", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: [
          "assignments:read",
          "assignments:create",
          "assignments:update",
          "assignments:withdraw",
        ],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Asignaciones de máquinas");
    expect(html).toContain("Crear asignación");
    expect(html).toContain('name="maquina_id"');
    expect(html).toContain('name="proyecto_id"');
    expect(html).toContain('name="operador_id"');
    expect(html).toContain('name="tarifa_aplicada"');
    expect(html).toContain("MAQ-001");
    expect(html).toContain("Proyecto Demo");
    expect(html).toContain("Juan Operador");
    expect(html).toContain("Retirar del proyecto");
    expect(html).toContain("Cerrar por finalización");
  });

  it("hides withdraw button for supervisor with assignments:update but not assignments:withdraw", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read", "assignments:update"],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Cerrar por finalización");
    expect(html).not.toContain("Retirar del proyecto");
    expect(html).not.toContain("Crear asignación");
  });

  it("hides create form and action buttons for read-only sessions", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read"],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Asignaciones visibles en modo lectura.");
    expect(html).toContain("MAQ-001");
    expect(html).toContain("Proyecto Demo");
    expect(html).toContain("Juan Operador");
    expect(html).not.toContain("Crear asignación");
    expect(html).not.toContain("Retirar del proyecto");
    expect(html).not.toContain("Cerrar por finalización");
  });

  it("shows create form but no update buttons for create-only sessions", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read", "assignments:create"],
        assignments: [],
        allAssignments: [],
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Crear asignación");
    expect(html).not.toContain("Retirar del proyecto");
    expect(html).not.toContain("Cerrar por finalización");
  });

  it("shows warning when no por_tiempo active machines exist", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read", "assignments:create"],
        assignments: [],
        allAssignments: [],
        machines: [
          {
            ...machines[0],
            tipo: "acarreo" as const,
          },
        ],
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("No hay máquinas por tiempo activas disponibles.");
    expect(html).not.toContain("Crear asignación");
  });

  it("shows empty state when no active assignments", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read", "assignments:create"],
        assignments: [],
        allAssignments: [],
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("No hay asignaciones activas.");
    expect(html).toContain("Crear asignación");
    expect(html).not.toContain("Proyecto:");
  });

  it("renders sidebar with active assignments href", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read"],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain('href="/dashboard/assignments"');
  });

  it("renders filter dropdowns for proyecto and maquina", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read"],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Filtros");
    expect(html).toContain('name="filter_proyecto_id"');
    expect(html).toContain('name="filter_maquina_id"');
  });

  it("renders Historial button per assignment row", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read"],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Historial");
  });

  it("shows differentiated empty state when filters are active", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read", "assignments:create"],
        assignments: [],
        allAssignments: [],
        machines,
        projects,
        subprojects: [],
        operators,
        proyectoFilter: "project-1",
        maquinaFilter: undefined,
      })
    );

    expect(html).toContain(
      "No hay asignaciones activas para los filtros seleccionados."
    );
    expect(html).not.toContain("No hay asignaciones activas.");
  });

  it("shows read-only banner for supervisor with assignments:read but no create or update", () => {
    const html = renderToStaticMarkup(
      renderAssignmentsShell({
        tenantName: "Tenant Demo",
        tenantTimezone: "America/Argentina/Buenos_Aires",
        capabilities: ["assignments:read"],
        assignments,
        allAssignments: assignments,
        machines,
        projects,
        subprojects: [],
        operators,
      })
    );

    expect(html).toContain("Asignaciones visibles en modo lectura.");
    expect(html).not.toContain("Crear asignación");
    expect(html).not.toContain("Retirar del proyecto");
    expect(html).not.toContain("Cerrar por finalización");
  });
});
