import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AppSession, ClientCatalogSummary } from "@faena360/domain";
import {
  CapabilityDeniedError,
  createClientCatalogService,
} from "@faena360/application";
import {
  SupabaseAppSessionRepository,
  SupabaseClientCatalogRepository,
} from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import {
  APP_SESSION_COOKIE_NAME,
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";

type ClientCatalogShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly clients: readonly ClientCatalogSummary[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly hideAction?: (formData: FormData) => Promise<void>;
};

const CLIENTS_READ_CAPABILITY = "clients:read";
const CLIENTS_CREATE_CAPABILITY = "clients:create";
const CLIENTS_UPDATE_CAPABILITY = "clients:update";

export function renderClientCatalogShell(input: ClientCatalogShellInput) {
  const canCreateClients = input.capabilities.includes(
    CLIENTS_CREATE_CAPABILITY
  );
  const canUpdateClients = input.capabilities.includes(
    CLIENTS_UPDATE_CAPABILITY
  );

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="flex border-b border-[#dcebe1] bg-[#edf5ec] px-6 py-6 lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <p className="text-sm font-semibold text-[#173b29]">Faena360</p>
          <nav className="mt-8 space-y-2" aria-label="Módulos">
            <a
              className="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] hover:bg-white"
              href="/dashboard"
            >
              Dashboard
            </a>
            <a
              className="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white"
              href="/dashboard/clientes"
            >
              Clientes
            </a>
          </nav>
          <form action={logoutAction} className="mt-8 lg:mt-auto">
            <button
              className="w-full rounded-xl border border-[#d0e2d6] bg-white px-4 py-3 text-left text-sm font-semibold text-[#173b29] transition hover:bg-[#f7faf5]"
              type="submit"
            >
              Cerrar sesión
            </button>
          </form>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Clientes
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Catálogo de clientes activos del tenant autenticado. Los registros
              no se eliminan: se ocultan para conservar el historial.
            </p>
          </header>

          {canCreateClients ? (
            <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
              <h2 className="text-xl font-semibold">Crear cliente</h2>
              <form
                action={input.createAction}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <ClientFields />
                <button className="login-button md:col-span-2" type="submit">
                  Crear cliente
                </button>
              </form>
            </section>
          ) : (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Catálogo visible en modo lectura.
            </p>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Clientes activos</h2>
            {input.clients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  Todavía no hay clientes activos.
                </p>
                <p className="mt-2 text-sm text-[#385346]">
                  Cuando se creen clientes, aparecerán en esta lista del tenant.
                </p>
              </div>
            ) : null}

            {input.clients.map((client) => (
              <article
                className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                key={client.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{client.nombre}</p>
                    <p className="mt-1 text-sm text-[#385346]">
                      {client.correo ?? "Sin correo registrado"}
                    </p>
                  </div>
                  <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                    {client.estado}
                  </p>
                </div>
                <dl className="mt-4 grid gap-3 text-sm text-[#385346] md:grid-cols-3">
                  <ClientDetail label="Teléfono" value={client.telefono} />
                  <ClientDetail
                    label="Identificación"
                    value={client.identificacion}
                  />
                  <ClientDetail label="Dirección" value={client.direccion} />
                </dl>

                {canUpdateClients ? (
                  <>
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-2"
                    >
                      <input name="clientId" type="hidden" value={client.id} />
                      <ClientFields client={client} />
                      <button
                        className="login-button md:col-span-2"
                        type="submit"
                      >
                        Guardar cambios
                      </button>
                    </form>
                    <form action={input.hideAction} className="mt-4">
                      <input name="clientId" type="hidden" value={client.id} />
                      <button
                        className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#8a1f16]"
                        type="submit"
                      >
                        Ocultar cliente
                      </button>
                    </form>
                  </>
                ) : null}
              </article>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}

function ClientFields({ client }: { readonly client?: ClientCatalogSummary }) {
  return (
    <>
      <label className="space-y-2 text-sm font-medium">
        <span>Nombre</span>
        <input
          className="login-input"
          name="nombre"
          required
          type="text"
          defaultValue={client?.nombre ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Teléfono</span>
        <input
          className="login-input"
          name="telefono"
          type="tel"
          defaultValue={client?.telefono ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Correo</span>
        <input
          className="login-input"
          name="correo"
          type="email"
          defaultValue={client?.correo ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Identificación</span>
        <input
          className="login-input"
          name="identificacion"
          type="text"
          defaultValue={client?.identificacion ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium md:col-span-2">
        <span>Dirección</span>
        <input
          className="login-input"
          name="direccion"
          type="text"
          defaultValue={client?.direccion ?? ""}
        />
      </label>
    </>
  );
}

function ClientDetail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}) {
  return (
    <div>
      <dt className="font-semibold text-[#173b29]">{label}</dt>
      <dd className="mt-1">{value ?? "Sin dato"}</dd>
    </div>
  );
}

export async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(APP_SESSION_COOKIE_NAME);
  redirect("/");
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
  if (!canAccessClientCatalogPage(session.effective_capabilities)) {
    redirect("/dashboard");
  }

  return session;
}

export function canAccessClientCatalogPage(
  capabilities: readonly string[]
): boolean {
  return capabilities.includes(CLIENTS_READ_CAPABILITY);
}

export function canRunClientCatalogAction(
  capabilities: readonly string[],
  capability: string
): boolean {
  return (
    canAccessClientCatalogPage(capabilities) &&
    capabilities.includes(capability)
  );
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

export async function createClientAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();
  if (
    !canRunClientCatalogAction(
      session.effective_capabilities,
      CLIENTS_CREATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildClientCatalogService(session);
  const result = await service.createClient(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      nombre: getString(formData, "nombre"),
      telefono: getString(formData, "telefono"),
      correo: getString(formData, "correo"),
      identificacion: getString(formData, "identificacion"),
      direccion: getString(formData, "direccion"),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "client_create_failed");
  }

  revalidatePath("/dashboard/clientes");
}

export async function updateClientAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();
  if (
    !canRunClientCatalogAction(
      session.effective_capabilities,
      CLIENTS_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildClientCatalogService(session);
  const result = await service.updateClient(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      clientId: getString(formData, "clientId"),
      nombre: getString(formData, "nombre"),
      telefono: getString(formData, "telefono"),
      correo: getString(formData, "correo"),
      identificacion: getString(formData, "identificacion"),
      direccion: getString(formData, "direccion"),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "client_update_failed");
  }

  revalidatePath("/dashboard/clientes");
}

export async function hideClientAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();
  if (
    !canRunClientCatalogAction(
      session.effective_capabilities,
      CLIENTS_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const service = buildClientCatalogService(session);
  const result = await service.hideClient(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    { clientId: getString(formData, "clientId") }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "client_update_failed");
  }

  revalidatePath("/dashboard/clientes");
}

export default async function ClientesPage() {
  const session = await getAuthorizedPageSession();
  const service = buildClientCatalogService(session);
  const [tenantName, clients] = await Promise.all([
    lookupTenantName(session.tenant_id),
    service.listActiveClients({
      tenant_id: session.tenant_id,
      user_id: session.user_id,
    }),
  ]);

  return renderClientCatalogShell({
    tenantName,
    capabilities: session.effective_capabilities,
    clients,
    createAction: createClientAction,
    updateAction: updateClientAction,
    hideAction: hideClientAction,
  });
}
