import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type {
  AppSession,
  ProjectCatalogSummary,
  SubprojectCatalogSummary,
  SubprojectFormaCobro,
} from "@faena360/domain";
import {
  CapabilityDeniedError,
  createProjectCatalogService,
  createSubprojectCatalogService,
} from "@faena360/application";
import {
  SupabaseAppSessionRepository,
  SupabaseProjectCatalogRepository,
  SupabaseSubprojectCatalogRepository,
} from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { DashboardSidebar } from "../_components/dashboard-sidebar";

const SUBPROJECTS_READ_CAPABILITY = "subprojects:read";
const SUBPROJECTS_CREATE_CAPABILITY = "subprojects:create";
const SUBPROJECTS_UPDATE_CAPABILITY = "subprojects:update";
const SUBPROJECTS_FINISH_CAPABILITY = "subprojects:finish";
const SUBPROJECTS_REOPEN_CAPABILITY = "subprojects:reopen";
const SUBPROJECTS_HIDE_CAPABILITY = "subprojects:hide";
const PROJECTS_READ_CAPABILITY = "projects:read";

const FORMAS_COBRO: Array<{
  readonly value: SubprojectFormaCobro;
  readonly label: string;
}> = [
  { value: "monto_fijo", label: "Monto fijo" },
  { value: "por_horas", label: "Por horas" },
  { value: "por_dia", label: "Por día" },
];

type SubprojectCatalogShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly subprojects: readonly SubprojectCatalogSummary[];
  readonly projects: readonly ProjectCatalogSummary[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly finishAction?: (formData: FormData) => Promise<void>;
  readonly reopenAction?: (formData: FormData) => Promise<void>;
  readonly hideAction?: (formData: FormData) => Promise<void>;
};

type SubprojectLifecycleFinishCardProps = {
  readonly action?: (formData: FormData) => Promise<void>;
  readonly subprojectId: string;
};

export function renderSubprojectCatalogShell(
  input: SubprojectCatalogShellInput
) {
  const canCreate =
    canRunSubprojectCatalogAction(
      input.capabilities,
      SUBPROJECTS_CREATE_CAPABILITY
    ) && canReadProjects(input.capabilities);

  const canUpdate = canRunSubprojectCatalogAction(
    input.capabilities,
    SUBPROJECTS_UPDATE_CAPABILITY
  );

  const canFinish = canRunSubprojectCatalogAction(
    input.capabilities,
    SUBPROJECTS_FINISH_CAPABILITY
  );
  const canReopen = canRunSubprojectCatalogAction(
    input.capabilities,
    SUBPROJECTS_REOPEN_CAPABILITY
  );
  const canHide = canRunSubprojectCatalogAction(
    input.capabilities,
    SUBPROJECTS_HIDE_CAPABILITY
  );

  const canReadParentProjects = canReadProjects(input.capabilities);
  const projectById = new Map(input.projects.map((p) => [p.id, p.nombre]));

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={input.capabilities}
          activeHref="/dashboard/subprojects"
        />

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Subproyectos
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Catálogo de subproyectos activos y pausados del tenant
              autenticado.
            </p>
          </header>

          {canCreate ? (
            <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
              <h2 className="text-xl font-semibold">Crear subproyecto</h2>
              <form
                action={input.createAction}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <SubprojectFields projects={input.projects} />
                <button className="login-button md:col-span-2" type="submit">
                  Crear subproyecto
                </button>
              </form>
            </section>
          ) : (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Catálogo visible en modo lectura.
            </p>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Subproyectos visibles</h2>

            {input.subprojects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  Todavía no hay subproyectos visibles.
                </p>
              </div>
            ) : null}

            {input.subprojects.map((sub) => {
              const projectName = canReadParentProjects
                ? (projectById.get(sub.proyecto_id) ?? "Proyecto no encontrado")
                : null;

              return (
                <article
                  className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                  key={sub.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{sub.nombre}</p>
                      <p className="mt-1 text-sm text-[#385346]">
                        Proyecto: {projectName ?? `ID ${sub.proyecto_id}`}
                      </p>
                      {sub.ubicacion ? (
                        <p className="mt-1 text-sm text-[#385346]">
                          Ubicación: {sub.ubicacion}
                        </p>
                      ) : null}
                    </div>
                    <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                      {sub.estado}
                    </p>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm text-[#385346] md:grid-cols-3">
                    {sub.forma_cobro ? (
                      <div>
                        <dt className="font-semibold text-[#173b29]">Cobro</dt>
                        <dd>{sub.forma_cobro}</dd>
                      </div>
                    ) : null}
                    {sub.monto_fijo != null ? (
                      <div>
                        <dt className="font-semibold text-[#173b29]">
                          Monto fijo
                        </dt>
                        <dd>${sub.monto_fijo.toLocaleString()}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="font-semibold text-[#173b29]">
                        Actualización
                      </dt>
                      <dd>{sub.updated_at}</dd>
                    </div>
                  </dl>

                  {canUpdate ? (
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-2"
                    >
                      <input name="subprojectId" type="hidden" value={sub.id} />
                      <SubprojectFields
                        subproject={sub}
                        projects={input.projects}
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
                    {canFinish &&
                    sub.estado !== "finalizado" &&
                    sub.estado !== "oculto" ? (
                      <SubprojectLifecycleFinishCard
                        action={input.finishAction}
                        subprojectId={sub.id}
                      />
                    ) : null}

                    {canReopen && sub.estado === "finalizado" ? (
                      <form
                        action={input.reopenAction}
                        className="space-y-3 rounded-xl border border-[#dbedff] p-4"
                      >
                        <input
                          name="subprojectId"
                          type="hidden"
                          value={sub.id}
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
                          Reabrir subproyecto
                        </button>
                      </form>
                    ) : null}

                    {canHide ? (
                      <form
                        action={input.hideAction}
                        className="space-y-3 rounded-xl border border-[#f5d0d0] p-4"
                      >
                        <input
                          name="subprojectId"
                          type="hidden"
                          value={sub.id}
                        />
                        <button
                          className="rounded-xl bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[#8a1f16]"
                          type="submit"
                        >
                          Ocultar subproyecto
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

type SubprojectFieldsProps = {
  readonly subproject?: SubprojectCatalogSummary;
  readonly projects: readonly ProjectCatalogSummary[];
};

function SubprojectFields({ subproject, projects }: SubprojectFieldsProps) {
  const isCreate = !subproject;

  return (
    <>
      {isCreate ? (
        <label className="space-y-2 text-sm font-medium md:col-span-2">
          <span>Proyecto padre</span>
          <select
            className="login-input"
            name="proyecto_id"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Seleccionar proyecto activo
            </option>
            {projects
              .filter((p) => p.estado !== "finalizado")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      <label className="space-y-2 text-sm font-medium">
        <span>Nombre del subproyecto</span>
        <input
          className="login-input"
          name="nombre"
          required
          type="text"
          defaultValue={subproject?.nombre ?? ""}
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Ubicación (opcional, hereda del proyecto)</span>
        <input
          className="login-input"
          name="ubicacion"
          type="text"
          defaultValue={subproject?.ubicacion ?? ""}
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Forma de cobro (opcional, hereda del proyecto)</span>
        <select
          className="login-input"
          name="forma_cobro"
          defaultValue={subproject?.forma_cobro ?? ""}
        >
          <option value="">Heredar del proyecto</option>
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
            subproject?.monto_fijo != null
              ? subproject.monto_fijo.toString()
              : ""
          }
        />
      </label>
    </>
  );
}

function SubprojectLifecycleFinishCard({
  action,
  subprojectId,
}: SubprojectLifecycleFinishCardProps) {
  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-[#ffe2dd] p-4"
    >
      <input name="subprojectId" type="hidden" value={subprojectId} />
      <p className="text-sm text-[#385346]">
        Si existen jornadas abiertas, la finalización administrativa exige
        confirmación explícita, un motivo y anula esas jornadas fuera de los
        totales operativos y financieros.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="force" value="true" />
        <span>Forzar finalización</span>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="confirmation" value="true" required />
        <span>
          Confirmo la finalización y la anulación de jornadas abiertas afectadas
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
        className="rounded-xl bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[#8a1f16]"
        type="submit"
      >
        Finalizar subproyecto
      </button>
    </form>
  );
}

// ── Session helpers ──────────────────────────────────────────────────

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
  if (!canAccessSubprojectCatalogPage(session.effective_capabilities)) {
    redirect("/dashboard");
  }

  return session;
}

// ── Capability gate functions ────────────────────────────────────────

export function canAccessSubprojectCatalogPage(
  capabilities: readonly string[]
): boolean {
  return capabilities.includes(SUBPROJECTS_READ_CAPABILITY);
}

export function canRunSubprojectCatalogAction(
  capabilities: readonly string[],
  capability: string
) {
  return (
    canAccessSubprojectCatalogPage(capabilities) &&
    capabilities.includes(capability)
  );
}

function canReadProjects(capabilities: readonly string[]): boolean {
  return capabilities.includes(PROJECTS_READ_CAPABILITY);
}

// ── Service builders ─────────────────────────────────────────────────

function buildSubprojectCatalogService(session: AppSession) {
  const serviceClient = createWebSupabaseServiceClient();

  return createSubprojectCatalogService({
    repository: new SupabaseSubprojectCatalogRepository(serviceClient),
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

// ── Tenant name lookup ───────────────────────────────────────────────

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

// ── Form helpers ─────────────────────────────────────────────────────

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
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

function getOptionalString(
  formData: FormData,
  key: string
): string | undefined {
  const value = getString(formData, key).trim();
  return value === "" ? undefined : value;
}

export function assertFinishConfirmation(formData: FormData): void {
  if (!getBoolean(formData, "confirmation")) {
    throw new Error("missing_finish_confirmation");
  }
}

// ── Server Actions ───────────────────────────────────────────────────

export async function createSubprojectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunSubprojectCatalogAction(
      session.effective_capabilities,
      SUBPROJECTS_CREATE_CAPABILITY
    ) ||
    !canReadProjects(session.effective_capabilities)
  ) {
    redirect("/dashboard");
  }

  const service = buildSubprojectCatalogService(session);
  const result = await service.createSubproject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      proyecto_id: getString(formData, "proyecto_id").trim(),
      nombre: getString(formData, "nombre").trim(),
      ubicacion: getOptionalString(formData, "ubicacion"),
      forma_cobro: (getOptionalString(formData, "forma_cobro") ?? undefined) as
        | SubprojectFormaCobro
        | undefined,
      monto_fijo: getMontoFijo(formData),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "subproject_create_failed");
  }

  revalidatePath("/dashboard/subprojects");
}

export async function updateSubprojectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunSubprojectCatalogAction(
      session.effective_capabilities,
      SUBPROJECTS_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildSubprojectCatalogService(session);
  const result = await service.updateSubproject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      subprojectId: getString(formData, "subprojectId").trim(),
      nombre: getString(formData, "nombre").trim(),
      ubicacion: getOptionalString(formData, "ubicacion"),
      forma_cobro: (getOptionalString(formData, "forma_cobro") ?? undefined) as
        | SubprojectFormaCobro
        | undefined,
      monto_fijo: getMontoFijo(formData),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "subproject_update_failed");
  }

  revalidatePath("/dashboard/subprojects");
}

export async function finishSubprojectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  assertFinishConfirmation(formData);

  if (
    !canRunSubprojectCatalogAction(
      session.effective_capabilities,
      SUBPROJECTS_FINISH_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildSubprojectCatalogService(session);
  const result = await service.finishSubproject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      subprojectId: getString(formData, "subprojectId").trim(),
      force: getBoolean(formData, "force"),
      reason: getString(formData, "reason").trim(),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "subproject_finish_failed");
  }

  revalidatePath("/dashboard/subprojects");
}

export async function reopenSubprojectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunSubprojectCatalogAction(
      session.effective_capabilities,
      SUBPROJECTS_REOPEN_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildSubprojectCatalogService(session);
  const result = await service.reopenSubproject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      subprojectId: getString(formData, "subprojectId").trim(),
      target_estado: getReopenTargetEstado(formData),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "subproject_reopen_failed");
  }

  revalidatePath("/dashboard/subprojects");
}

export async function hideSubprojectAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunSubprojectCatalogAction(
      session.effective_capabilities,
      SUBPROJECTS_HIDE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildSubprojectCatalogService(session);
  const result = await service.hideSubproject(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      subprojectId: getString(formData, "subprojectId").trim(),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "subproject_hide_failed");
  }

  revalidatePath("/dashboard/subprojects");
}

function getReopenTargetEstado(
  formData: FormData
): "activo" | "pausado" | undefined {
  const rawValue = getString(formData, "targetEstado");
  if (rawValue === "pausado") return "pausado";
  if (rawValue === "activo") return "activo";
  return undefined;
}

// ── Page component ───────────────────────────────────────────────────

export default async function SubproyectosPage() {
  const session = await getAuthorizedPageSession();
  const subprojectService = buildSubprojectCatalogService(session);

  const canReadParentProjects = canReadProjects(session.effective_capabilities);
  const [tenantName, subprojects, projects] = await Promise.all([
    lookupTenantName(session.tenant_id),
    subprojectService.listVisibleSubprojects({
      tenant_id: session.tenant_id,
      user_id: session.user_id,
    }),
    canReadParentProjects
      ? buildProjectCatalogService(session).listVisibleProjects({
          tenant_id: session.tenant_id,
          user_id: session.user_id,
        })
      : Promise.resolve([] as const),
  ]);

  return renderSubprojectCatalogShell({
    tenantName,
    capabilities: session.effective_capabilities,
    subprojects,
    projects,
    createAction: createSubprojectAction,
    updateAction: updateSubprojectAction,
    finishAction: finishSubprojectAction,
    reopenAction: reopenSubprojectAction,
    hideAction: hideSubprojectAction,
  });
}
