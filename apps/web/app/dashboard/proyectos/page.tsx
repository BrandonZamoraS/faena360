import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type {
  AppSession,
  ClientCatalogSummary,
  ProjectCatalogSummary,
  ProjectFormaCobro,
} from "@faena360/domain";
import {
  CapabilityDeniedError,
  createClientCatalogService,
  createProjectCatalogService,
} from "@faena360/application";
import {
  SupabaseAppSessionRepository,
  SupabaseClientCatalogRepository,
  SupabaseProjectCatalogRepository,
} from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { DashboardSidebar } from "../_components/dashboard-sidebar";

const PROJECTS_READ_CAPABILITY = "projects:read";
const PROJECTS_CREATE_CAPABILITY = "projects:create";
const PROJECTS_UPDATE_CAPABILITY = "projects:update";
const PROJECTS_PAUSE_CAPABILITY = "projects:pause";
const PROJECTS_FINISH_CAPABILITY = "projects:finish";
const PROJECTS_REOPEN_CAPABILITY = "projects:reopen";
const PROJECTS_HIDE_CAPABILITY = "projects:hide";
const CLIENTS_READ_CAPABILITY = "clients:read";

const FORMAS_COBRO: Array<{
  readonly value: ProjectFormaCobro;
  readonly label: string;
}> = [
  { value: "monto_fijo", label: "Monto fijo" },
  { value: "por_horas", label: "Por horas" },
  { value: "por_dia", label: "Por día" },
];

type ProjectCatalogShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly projects: readonly ProjectCatalogSummary[];
  readonly clients: readonly ClientCatalogSummary[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly pauseAction?: (formData: FormData) => Promise<void>;
  readonly finishAction?: (formData: FormData) => Promise<void>;
  readonly reopenAction?: (formData: FormData) => Promise<void>;
  readonly hideAction?: (formData: FormData) => Promise<void>;
};

type ProjectLifecycleActionCardProps = {
  readonly action?: (formData: FormData) => Promise<void>;
  readonly projectId: string;
  readonly variant: "pause" | "finish";
};

export function renderProjectCatalogShell(input: ProjectCatalogShellInput) {
  const canCreate =
    canRunProjectCatalogAction(
      input.capabilities,
      PROJECTS_CREATE_CAPABILITY
    ) && canReadActiveClients(input.capabilities);

  const canUpdate =
    canRunProjectCatalogAction(
      input.capabilities,
      PROJECTS_UPDATE_CAPABILITY
    ) && canReadActiveClients(input.capabilities);

  const canPause = canRunProjectCatalogAction(
    input.capabilities,
    PROJECTS_PAUSE_CAPABILITY
  );
  const canFinish = canRunProjectCatalogAction(
    input.capabilities,
    PROJECTS_FINISH_CAPABILITY
  );
  const canReopen = canRunProjectCatalogAction(
    input.capabilities,
    PROJECTS_REOPEN_CAPABILITY
  );
  const canHide = canRunProjectCatalogAction(
    input.capabilities,
    PROJECTS_HIDE_CAPABILITY
  );

  const canReadClients = canReadActiveClients(input.capabilities);
  const clientById = new Map(
    input.clients.map((client) => [client.id, client.nombre])
  );

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={input.capabilities}
          activeHref="/dashboard/proyectos"
        />

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Proyectos
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Catálogo de proyectos activos y pausados del tenant autenticado.
            </p>
          </header>

          {canCreate ? (
            <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
              <h2 className="text-xl font-semibold">Crear proyecto</h2>
              <form
                action={input.createAction}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <ProjectFields clients={input.clients} />
                <button className="login-button md:col-span-2" type="submit">
                  Crear proyecto
                </button>
              </form>
            </section>
          ) : (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Catálogo visible en modo lectura.
            </p>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Proyectos visibles</h2>

            {input.projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  Todavía no hay proyectos visibles.
                </p>
              </div>
            ) : null}

            {input.projects.map((project) => {
              const clientName = canReadClients
                ? (clientById.get(project.cliente_id) ??
                  "Cliente no encontrado")
                : null;

              return (
                <article
                  className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                  key={project.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{project.nombre}</p>
                      <p className="mt-1 text-sm text-[#385346]">
                        Cliente: {clientName ?? `ID ${project.cliente_id}`}
                      </p>
                      <p className="mt-1 text-sm text-[#385346]">
                        Ubicación: {project.ubicacion}
                      </p>
                      <p className="mt-1 text-sm text-[#385346]">
                        Inicio: {project.fecha_inicio}
                      </p>
                    </div>
                    <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                      {project.estado}
                    </p>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm text-[#385346] md:grid-cols-3">
                    <div>
                      <dt className="font-semibold text-[#173b29]">Cobro</dt>
                      <dd>{project.forma_cobro}</dd>
                    </div>
                    {project.monto_fijo ? (
                      <div>
                        <dt className="font-semibold text-[#173b29]">
                          Monto fijo
                        </dt>
                        <dd>${project.monto_fijo.toLocaleString()}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="font-semibold text-[#173b29]">
                        Actualización
                      </dt>
                      <dd>{project.updated_at}</dd>
                    </div>
                  </dl>

                  {canUpdate ? (
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-2"
                    >
                      <input
                        name="projectId"
                        type="hidden"
                        value={project.id}
                      />
                      <input
                        name="fecha_finalizacion"
                        type="hidden"
                        value={project.fecha_finalizacion ?? ""}
                      />
                      <ProjectFields
                        project={project}
                        clients={input.clients}
                      />
                      <button
                        className="login-button md:col-span-2"
                        type="submit"
                      >
                        Guardar cambios
                      </button>
                    </form>
                  ) : null}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {canPause && project.estado === "activo" ? (
                      <ProjectLifecycleActionCard
                        action={input.pauseAction}
                        projectId={project.id}
                        variant="pause"
                      />
                    ) : null}

                    {canFinish && project.estado !== "finalizado" ? (
                      <ProjectLifecycleActionCard
                        action={input.finishAction}
                        projectId={project.id}
                        variant="finish"
                      />
                    ) : null}

                    {canReopen && project.estado === "finalizado" ? (
                      <form
                        action={input.reopenAction}
                        className="space-y-3 rounded-xl border border-[#dbedff] p-4"
                      >
                        <input
                          name="projectId"
                          type="hidden"
                          value={project.id}
                        />
                        <label className="space-y-2 text-sm font-medium">
                          <span>Reabrir como</span>
                          <select
                            className="login-input"
                            name="targetEstado"
                            defaultValue="activo"
                          >
                            <option value="activo">Activo</option>
                            <option value="pausado">Pausado</option>
                          </select>
                        </label>
                        <button
                          className="rounded-xl bg-[#e8f7ff] px-3 py-2 text-sm font-semibold text-[#005f8a]"
                          type="submit"
                        >
                          Reabrir proyecto
                        </button>
                      </form>
                    ) : null}

                    {canHide ? (
                      <form
                        action={input.hideAction}
                        className="space-y-3 rounded-xl border border-[#f5d0d0] p-4"
                      >
                        <input
                          name="projectId"
                          type="hidden"
                          value={project.id}
                        />
                        <button
                          className="rounded-xl bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[#8a1f16]"
                          type="submit"
                        >
                          Ocultar proyecto
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        </section>
      </div>
    </main>
  );
}

type ProjectFieldsProps = {
  readonly project?: ProjectCatalogSummary;
  readonly clients: readonly ClientCatalogSummary[];
};

function ProjectFields({ project, clients }: ProjectFieldsProps) {
  return (
    <>
      <label className="space-y-2 text-sm font-medium">
        <span>Nombre del proyecto</span>
        <input
          className="login-input"
          name="nombre"
          required
          type="text"
          defaultValue={project?.nombre ?? ""}
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Cliente</span>
        <select
          className="login-input"
          name="cliente_id"
          required
          defaultValue={project?.cliente_id ?? ""}
        >
          <option value="">Seleccionar cliente activo</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm font-medium md:col-span-2">
        <span>Ubicación</span>
        <input
          className="login-input"
          name="ubicacion"
          required
          type="text"
          defaultValue={project?.ubicacion ?? ""}
        />
      </label>

      <label className="space-y-2 text-sm font-medium md:col-span-2">
        <span>Fecha de inicio</span>
        <input
          className="login-input"
          name="fecha_inicio"
          required
          type="date"
          defaultValue={project?.fecha_inicio ?? ""}
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Forma de cobro</span>
        <select
          className="login-input"
          name="forma_cobro"
          required
          defaultValue={project?.forma_cobro ?? "monto_fijo"}
        >
          {FORMAS_COBRO.map((forma) => (
            <option key={forma.value} value={forma.value}>
              {forma.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Monto fijo (solo si aplica)</span>
        <input
          className="login-input"
          name="monto_fijo"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={
            project?.monto_fijo != null ? project.monto_fijo.toString() : ""
          }
        />
      </label>
    </>
  );
}

function ProjectLifecycleActionCard({
  action,
  projectId,
  variant,
}: ProjectLifecycleActionCardProps) {
  const isPause = variant === "pause";

  return (
    <form
      action={action}
      className={`space-y-3 rounded-xl border p-4 ${
        isPause ? "border-[#ddebdc]" : "border-[#ffe2dd]"
      }`}
    >
      <input name="projectId" type="hidden" value={projectId} />
      <p className="text-sm text-[#385346]">
        {isPause
          ? "Si existen jornadas abiertas, la pausa administrativa exige confirmación explícita y un motivo para anularlas."
          : "Si existen jornadas abiertas, la finalización administrativa exige confirmación explícita, un motivo y anula esas jornadas fuera de los totales operativos y financieros."}
      </p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="force" value="true" />
        <span>{isPause ? "Forzar pausa" : "Forzar finalización"}</span>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="confirmation"
          value="true"
          required={!isPause}
        />
        <span>
          {isPause
            ? "Confirmo que debo anular las jornadas abiertas afectadas"
            : "Confirmo la finalización y la anulación de jornadas abiertas afectadas"}
        </span>
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Motivo de fuerza</span>
        <input
          className="login-input"
          name="reason"
          type="text"
          placeholder="Obligatorio si se fuerza"
        />
      </label>
      <button
        className={`rounded-xl px-3 py-2 text-sm font-semibold ${
          isPause
            ? "bg-[#fff7e6] text-[#6a4600]"
            : "bg-[#fff1f0] text-[#8a1f16]"
        }`}
        type="submit"
      >
        {isPause ? "Pausar proyecto" : "Finalizar proyecto"}
      </button>
    </form>
  );
}

async function getWebSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  const serviceClient = createWebSupabaseServiceClient();
  const repository = new SupabaseAppSessionRepository(serviceClient);
  const authResult = await requireWebAccess(cookieStore, {
    sessionRefresher: createServerStateSessionRefresher(repository),
  });

  if (!authResult.ok) {
    redirect("/dashboard");
  }

  return authResult.session;
}

async function getAuthorizedPageSession(): Promise<AppSession> {
  const session = await getWebSession();
  if (!canAccessProjectCatalogPage(session.effective_capabilities)) {
    redirect("/dashboard");
  }

  return session;
}

export function canAccessProjectCatalogPage(
  capabilities: readonly string[]
): boolean {
  return capabilities.includes(PROJECTS_READ_CAPABILITY);
}

export function canRunProjectCatalogAction(
  capabilities: readonly string[],
  capability: string
) {
  return (
    canAccessProjectCatalogPage(capabilities) &&
    capabilities.includes(capability)
  );
}

function canReadActiveClients(capabilities: readonly string[]): boolean {
  return capabilities.includes(CLIENTS_READ_CAPABILITY);
}

function buildProjectCatalogService(session: AppSession) {
  const serviceClient = createWebSupabaseServiceClient();

  return createProjectCatalogService({
    repository: new SupabaseProjectCatalogRepository(serviceClient),
    capabilityChecker: {
      async requireCapability(_scope, capabilityCode) {
        if (!session.effective_capabilities.includes(capabilityCode)) {
          throw new CapabilityDeniedError(
            session.user_id,
            session.tenant_id,
            capabilityCode
          );
        }
      },
    },
  });
}

function buildClientCatalogService(session: AppSession) {
  const serviceClient = createWebSupabaseServiceClient();

  return createClientCatalogService({
    repository: new SupabaseClientCatalogRepository(serviceClient),
    capabilityChecker: {
      async requireCapability(_scope, capabilityCode) {
        if (!session.effective_capabilities.includes(capabilityCode)) {
          throw new CapabilityDeniedError(
            session.user_id,
            session.tenant_id,
            capabilityCode
          );
        }
      },
    },
  });
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

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getFechaInicio(formData: FormData): string {
  return getString(formData, "fecha_inicio").trim();
}

function getMontoFijo(formData: FormData): number | undefined {
  const rawMonto = getString(formData, "monto_fijo").trim();
  if (!rawMonto) {
    return undefined;
  }

  const parsed = Number(rawMonto);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = getString(formData, key).trim();
  return value === "" ? null : value;
}

function assertForcedConfirmation(
  formData: FormData,
  code: "missing_force_confirmation"
): void {
  if (getBoolean(formData, "force") && !getBoolean(formData, "confirmation")) {
    throw new Error(code);
  }
}

export function assertFinishConfirmation(formData: FormData): void {
  if (!getBoolean(formData, "confirmation")) {
    throw new Error("missing_finish_confirmation");
  }
}

export async function createProjectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunProjectCatalogAction(
      session.effective_capabilities,
      PROJECTS_CREATE_CAPABILITY
    ) ||
    !canReadActiveClients(session.effective_capabilities)
  ) {
    redirect("/dashboard");
  }

  const service = buildProjectCatalogService(session);
  const project = {
    nombre: getString(formData, "nombre").trim(),
    cliente_id: getString(formData, "cliente_id").trim(),
    ubicacion: getString(formData, "ubicacion").trim(),
    fecha_inicio: getFechaInicio(formData),
    forma_cobro: getString(formData, "forma_cobro"),
    monto_fijo: getMontoFijo(formData),
  };

  const result = await service.createProject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    project
  );

  if (!result.ok) {
    throw new Error(result.code ?? "project_create_failed");
  }

  revalidatePath("/dashboard/proyectos");
}

export async function updateProjectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunProjectCatalogAction(
      session.effective_capabilities,
      PROJECTS_UPDATE_CAPABILITY
    ) ||
    !canReadActiveClients(session.effective_capabilities)
  ) {
    redirect("/dashboard");
  }

  const service = buildProjectCatalogService(session);
  const result = await service.updateProject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      projectId: getString(formData, "projectId").trim(),
      nombre: getString(formData, "nombre").trim(),
      cliente_id: getString(formData, "cliente_id").trim(),
      ubicacion: getString(formData, "ubicacion").trim(),
      fecha_inicio: getFechaInicio(formData),
      forma_cobro: getString(formData, "forma_cobro"),
      monto_fijo: getMontoFijo(formData),
      fecha_finalizacion: getOptionalString(formData, "fecha_finalizacion"),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "project_update_failed");
  }

  revalidatePath("/dashboard/proyectos");
}

export async function pauseProjectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  assertFinishConfirmation(formData);

  if (
    !canRunProjectCatalogAction(
      session.effective_capabilities,
      PROJECTS_PAUSE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildProjectCatalogService(session);
  const result = await service.pauseProject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      projectId: getString(formData, "projectId").trim(),
      force: getBoolean(formData, "force"),
      reason: getString(formData, "reason").trim(),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "project_pause_failed");
  }

  revalidatePath("/dashboard/proyectos");
}

export async function finishProjectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  assertForcedConfirmation(formData, "missing_force_confirmation");

  if (
    !canRunProjectCatalogAction(
      session.effective_capabilities,
      PROJECTS_FINISH_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildProjectCatalogService(session);
  const result = await service.finishProject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      projectId: getString(formData, "projectId").trim(),
      force: getBoolean(formData, "force"),
      reason: getString(formData, "reason").trim(),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "project_finish_failed");
  }

  revalidatePath("/dashboard/proyectos");
}

export async function reopenProjectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunProjectCatalogAction(
      session.effective_capabilities,
      PROJECTS_REOPEN_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildProjectCatalogService(session);
  const result = await service.reopenProject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      projectId: getString(formData, "projectId").trim(),
      target_estado: getReopenTargetEstado(formData),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "project_reopen_failed");
  }

  revalidatePath("/dashboard/proyectos");
}

export async function hideProjectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunProjectCatalogAction(
      session.effective_capabilities,
      PROJECTS_HIDE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildProjectCatalogService(session);
  const result = await service.hideProject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      projectId: getString(formData, "projectId").trim(),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "project_hide_failed");
  }

  revalidatePath("/dashboard/proyectos");
}

function getReopenTargetEstado(formData: FormData): "activo" | "pausado" {
  const rawValue = getString(formData, "targetEstado");
  return rawValue === "pausado" ? "pausado" : "activo";
}

export default async function ProyectosPage() {
  const session = await getAuthorizedPageSession();
  const projectService = buildProjectCatalogService(session);

  const canReadClients = canReadActiveClients(session.effective_capabilities);
  const [tenantName, projects, clients] = await Promise.all([
    lookupTenantName(session.tenant_id),
    projectService.listVisibleProjects({
      tenant_id: session.tenant_id,
      user_id: session.user_id,
    }),
    canReadClients
      ? buildClientCatalogService(session).listActiveClients({
          tenant_id: session.tenant_id,
          user_id: session.user_id,
        })
      : Promise.resolve([] as const),
  ]);

  return renderProjectCatalogShell({
    tenantName,
    capabilities: session.effective_capabilities,
    projects,
    clients,
    createAction: createProjectAction,
    updateAction: updateProjectAction,
    pauseAction: pauseProjectAction,
    finishAction: finishProjectAction,
    reopenAction: reopenProjectAction,
    hideAction: hideProjectAction,
  });
}
