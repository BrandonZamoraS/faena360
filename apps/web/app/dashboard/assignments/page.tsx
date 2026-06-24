import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppSession } from "@faena360/domain";
import {
  SupabaseAppSessionRepository,
  SupabaseMachineCatalogRepository,
  SupabaseProjectCatalogRepository,
  SupabaseSubprojectCatalogRepository,
} from "@faena360/infrastructure";

import type {
  MachineCatalogSummary,
  ProjectCatalogSummary,
  SubprojectCatalogSummary,
} from "@faena360/domain";

import {
  canAccessAssignmentsPage,
  canRunAssignmentAction,
  createAssignmentAction,
  ASSIGNMENTS_CREATE_CAPABILITY,
  ASSIGNMENTS_PATH,
  ASSIGNMENTS_UPDATE_CAPABILITY,
  updateAssignmentStatusAction,
} from "./catalog";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import { DashboardSidebar } from "../_components/dashboard-sidebar";

interface AssignmentDisplayRow {
  id: string;
  maquina_id: string;
  proyecto_id: string;
  subproyecto_id: string | null;
  operador_id: string;
  tarifa_aplicada: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  maquina_codigo?: string;
  proyecto_nombre?: string;
  operador_full_name?: string;
}

interface OperatorOption {
  id: string;
  full_name: string;
}

type AssignmentsShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly assignments: readonly AssignmentDisplayRow[];
  readonly machines: readonly MachineCatalogSummary[];
  readonly projects: readonly ProjectCatalogSummary[];
  readonly subprojects: readonly SubprojectCatalogSummary[];
  readonly operators: readonly OperatorOption[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
};

const ESTADO_LABELS: Record<string, string> = {
  activa: "Activa",
  retirada_del_proyecto: "Retirada del proyecto",
  cerrada_por_finalizacion: "Cerrada por finalización",
  bloqueada_por_conflicto: "Bloqueada por conflicto",
};

export function renderAssignmentsShell(input: AssignmentsShellInput) {
  const canCreate = canRunAssignmentAction(
    input.capabilities,
    ASSIGNMENTS_CREATE_CAPABILITY
  );
  const canUpdate = canRunAssignmentAction(
    input.capabilities,
    ASSIGNMENTS_UPDATE_CAPABILITY
  );
  const canMutate = canCreate || canUpdate;
  const activeMachines = input.machines.filter(
    (m) => m.tipo === "por_tiempo" && m.estado === "activa"
  );
  const activeProjects = input.projects.filter((p) => p.estado === "activo");
  const activeSubprojects = input.subprojects.filter(
    (s) => s.estado === "activo"
  );

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={input.capabilities}
          activeHref={ASSIGNMENTS_PATH}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Asignaciones de máquinas
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Gestión de máquinas asignadas activamente a proyectos con
              operador.
            </p>
          </header>

          {!canMutate ? (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Asignaciones visibles en modo lectura.
            </p>
          ) : null}

          {canCreate ? (
            activeMachines.length === 0 || activeProjects.length === 0 ? (
              <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
                {activeMachines.length === 0
                  ? "No hay máquinas por tiempo activas disponibles."
                  : "No hay proyectos activos disponibles."}
              </p>
            ) : (
              <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
                <h2 className="text-xl font-semibold">Crear asignación</h2>
                <form
                  action={input.createAction}
                  className="mt-5 grid gap-4 md:grid-cols-2"
                >
                  <label className="space-y-2 text-sm font-medium">
                    <span>Máquina</span>
                    <select className="login-input" name="maquina_id" required>
                      <option value="">Seleccionar máquina</option>
                      {activeMachines.map((machine) => (
                        <option
                          key={machine.id}
                          value={machine.id}
                          data-tarifa-sugerida={machine.tarifa_sugerida ?? ""}
                        >
                          {machine.codigo}
                          {machine.tarifa_sugerida != null
                            ? ` (tarifa sugerida: ${machine.tarifa_sugerida})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>Proyecto</span>
                    <select className="login-input" name="proyecto_id" required>
                      <option value="">Seleccionar proyecto</option>
                      {activeProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {activeSubprojects.length > 0 ? (
                    <label className="space-y-2 text-sm font-medium">
                      <span>Subproyecto (opcional)</span>
                      <select className="login-input" name="subproyecto_id">
                        <option value="">Sin subproyecto</option>
                        {activeSubprojects.map((subproject) => (
                          <option key={subproject.id} value={subproject.id}>
                            {subproject.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="space-y-2 text-sm font-medium">
                    <span>Operador</span>
                    <select className="login-input" name="operador_id" required>
                      <option value="">Seleccionar operador</option>
                      {input.operators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>Tarifa aplicada</span>
                    <input
                      className="login-input"
                      name="tarifa_aplicada"
                      id="tarifa_aplicada"
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </label>
                  <button className="login-button md:col-span-2" type="submit">
                    Crear asignación
                  </button>
                </form>
                {/* Preload tarifa_sugerida when machine selection changes */}
                <script
                  dangerouslySetInnerHTML={{
                    __html: `
                      (function() {
                        var select = document.querySelector('select[name="maquina_id"]');
                        var tarifaInput = document.getElementById('tarifa_aplicada');
                        if (!select || !tarifaInput) return;
                        select.addEventListener('change', function() {
                          var option = select.options[select.selectedIndex];
                          var suggested = option.getAttribute('data-tarifa-sugerida');
                          if (suggested) {
                            tarifaInput.value = suggested;
                          }
                        });
                      })();
                    `,
                  }}
                />
              </section>
            )
          ) : null}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Asignaciones activas</h2>

            {input.assignments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  No hay asignaciones activas.
                </p>
              </div>
            ) : null}

            {input.assignments.map((assignment) => (
              <article
                className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                key={assignment.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      {assignment.maquina_codigo ?? assignment.maquina_id}
                    </p>
                    <p className="mt-1 text-sm text-[#385346]">
                      Proyecto:{" "}
                      {assignment.proyecto_nombre ?? assignment.proyecto_id}
                    </p>
                    <p className="mt-1 text-sm text-[#385346]">
                      Operador:{" "}
                      {assignment.operador_full_name ?? assignment.operador_id}
                    </p>
                  </div>
                  <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                    {ESTADO_LABELS[assignment.estado] ?? assignment.estado}
                  </p>
                </div>

                <dl className="mt-4 grid gap-2 text-sm text-[#385346] md:grid-cols-3">
                  <div>
                    <dt className="font-semibold text-[#173b29]">Tarifa</dt>
                    <dd>{assignment.tarifa_aplicada}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#173b29]">
                      Fecha inicio
                    </dt>
                    <dd>
                      {new Date(assignment.fecha_inicio).toLocaleDateString(
                        "es-AR"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#173b29]">Fecha fin</dt>
                    <dd>
                      {assignment.fecha_fin
                        ? new Date(assignment.fecha_fin).toLocaleDateString(
                            "es-AR"
                          )
                        : "—"}
                    </dd>
                  </div>
                </dl>

                {canUpdate ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <form
                      action={input.updateAction}
                      className="space-y-3 rounded-xl border border-[#f5d0d0] p-4"
                    >
                      <input
                        name="assignmentId"
                        type="hidden"
                        value={assignment.id}
                      />
                      <input
                        name="estado"
                        type="hidden"
                        value="retirada_del_proyecto"
                      />
                      <button
                        className="rounded-xl bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[#8a1f16]"
                        type="submit"
                      >
                        Retirar del proyecto
                      </button>
                    </form>

                    <form
                      action={input.updateAction}
                      className="space-y-3 rounded-xl border border-[#dbedff] p-4"
                    >
                      <input
                        name="assignmentId"
                        type="hidden"
                        value={assignment.id}
                      />
                      <input
                        name="estado"
                        type="hidden"
                        value="cerrada_por_finalizacion"
                      />
                      <button
                        className="rounded-xl bg-[#e8f7ff] px-3 py-2 text-sm font-semibold text-[#005f8a]"
                        type="submit"
                      >
                        Cerrar por finalización
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}

async function getAuthorizedPageSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  const serviceClient = createWebSupabaseServiceClient();
  const repository = new SupabaseAppSessionRepository(serviceClient);
  const authResult = await requireWebAccess(cookieStore, {
    sessionRefresher: createServerStateSessionRefresher(repository),
  });
  if (!authResult.ok) {
    redirect("/dashboard");
  }
  if (!canAccessAssignmentsPage(authResult.session.effective_capabilities)) {
    redirect("/dashboard");
  }
  return authResult.session;
}

async function lookupTenantName(tenantId: string): Promise<string> {
  const { data, error } = await createWebSupabaseServiceClient()
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single<{ name: string }>();
  if (error || !data) {
    throw new Error(error?.message ?? "Tenant not found");
  }
  return data.name;
}

async function listActiveAssignmentsWithJoins(
  tenantId: string
): Promise<readonly AssignmentDisplayRow[]> {
  const client = createWebSupabaseServiceClient();
  const response = await client.rpc("list_asignaciones_activas", {
    p_tenant_id: tenantId,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  const rows = response.data as AssignmentDisplayRow[] | null;
  if (!rows) {
    return [];
  }

  return rows;
}

async function listActivePorTiempoMachines(
  tenantId: string
): Promise<readonly MachineCatalogSummary[]> {
  const machines = await new SupabaseMachineCatalogRepository(
    createWebSupabaseServiceClient()
  ).listVisible({ tenantId });
  return machines.filter(
    (m) => m.tipo === "por_tiempo" && m.estado === "activa"
  );
}

async function listActiveProjects(
  tenantId: string
): Promise<readonly ProjectCatalogSummary[]> {
  const projects = await new SupabaseProjectCatalogRepository(
    createWebSupabaseServiceClient()
  ).listVisible({ tenantId });
  return projects.filter((p) => p.estado === "activo");
}

async function listActiveSubprojects(
  tenantId: string
): Promise<readonly SubprojectCatalogSummary[]> {
  const subprojects = await new SupabaseSubprojectCatalogRepository(
    createWebSupabaseServiceClient()
  ).listVisible({ tenantId });
  return subprojects.filter((s) => s.estado === "activo");
}

async function listOperatorsForTenant(
  tenantId: string
): Promise<readonly OperatorOption[]> {
  const { data, error } = await createWebSupabaseServiceClient()
    .from("user_profiles")
    .select("id, full_name, user_roles!inner(role_id), roles!inner(name)")
    .eq("tenant_id", tenantId)
    .eq("roles.name", "operador")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const profiles = data as readonly {
    id: string;
    full_name: string;
  }[];

  return profiles;
}

export default async function AssignmentsPage() {
  const session = await getAuthorizedPageSession();
  const [tenantName, assignments, machines, projects, subprojects, operators] =
    await Promise.all([
      lookupTenantName(session.tenant_id),
      listActiveAssignmentsWithJoins(session.tenant_id),
      listActivePorTiempoMachines(session.tenant_id),
      listActiveProjects(session.tenant_id),
      listActiveSubprojects(session.tenant_id),
      listOperatorsForTenant(session.tenant_id),
    ]);

  return renderAssignmentsShell({
    tenantName,
    capabilities: session.effective_capabilities,
    assignments,
    machines,
    projects,
    subprojects,
    operators,
    createAction: createAssignmentAction,
    updateAction: updateAssignmentStatusAction,
  });
}
