import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AppSession } from "@faena360/domain";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { SupabaseAppSessionRepository } from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import { DashboardSidebar } from "../_components/dashboard-sidebar";

const FUEL_TYPES_READ_CAPABILITY = "fuel_types:read";
const FUEL_TYPES_CREATE_CAPABILITY = "fuel_types:create";
const FUEL_TYPES_UPDATE_CAPABILITY = "fuel_types:update";

type FuelTypeSummary = {
  readonly id: string;
  readonly tenant_id: string;
  readonly nombre: string;
  readonly estado: "activo" | "oculto";
  readonly created_at: string;
  readonly updated_at: string;
};

type FuelTypeCatalogShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly fuelTypes: readonly FuelTypeSummary[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly hideAction?: (formData: FormData) => Promise<void>;
};

export function renderFuelTypeCatalogShell(input: FuelTypeCatalogShellInput) {
  const canCreateFuelTypes = input.capabilities.includes(
    FUEL_TYPES_CREATE_CAPABILITY
  );
  const canUpdateFuelTypes = input.capabilities.includes(
    FUEL_TYPES_UPDATE_CAPABILITY
  );

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={input.capabilities}
          activeHref="/dashboard/tipos_combustible"
        />

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Tipos de combustible
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Catálogo de tipos activos del tenant autenticado.
            </p>
          </header>

          {canCreateFuelTypes ? (
            <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
              <h2 className="text-xl font-semibold">
                Crear tipo de combustible
              </h2>
              <form
                action={input.createAction}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <FuelTypeNameField />
                <button className="login-button md:col-span-2" type="submit">
                  Crear tipo
                </button>
              </form>
            </section>
          ) : (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Catálogo visible en modo lectura.
            </p>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Tipos activos</h2>
            {input.fuelTypes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  Todavía no hay tipos de combustible activos.
                </p>
                <p className="mt-2 text-sm text-[#385346]">
                  Cuando se creen tipos, aparecerán en esta lista del tenant.
                </p>
              </div>
            ) : null}

            {input.fuelTypes.map((fuelType) => (
              <article
                className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                key={fuelType.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{fuelType.nombre}</p>
                    <p className="mt-1 text-sm text-[#385346]">
                      ID: {fuelType.id}
                    </p>
                  </div>
                  <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                    {fuelType.estado}
                  </p>
                </div>

                {canUpdateFuelTypes ? (
                  <>
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-2"
                    >
                      <input
                        name="fuelTypeId"
                        type="hidden"
                        value={fuelType.id}
                      />
                      <FuelTypeNameField fuelTypeName={fuelType.nombre} />
                      <button
                        className="login-button md:col-span-2"
                        type="submit"
                      >
                        Guardar cambios
                      </button>
                    </form>
                    <form action={input.hideAction} className="mt-4">
                      <input
                        name="fuelTypeId"
                        type="hidden"
                        value={fuelType.id}
                      />
                      <button
                        className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#8a1f16]"
                        type="submit"
                      >
                        Ocultar tipo de combustible
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

function FuelTypeNameField({
  fuelTypeName = "",
}: {
  readonly fuelTypeName?: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium md:col-span-2">
      <span>Nombre</span>
      <input
        className="login-input"
        name="nombre"
        required
        type="text"
        defaultValue={fuelTypeName}
      />
    </label>
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

  if (!canAccessFuelTypeCatalogPage(session.effective_capabilities)) {
    redirect("/dashboard");
  }

  return session;
}

export function canAccessFuelTypeCatalogPage(
  capabilities: readonly string[]
): boolean {
  return capabilities.includes(FUEL_TYPES_READ_CAPABILITY);
}

export function canRunFuelTypeCatalogAction(
  capabilities: readonly string[],
  capability: string
): boolean {
  return (
    canAccessFuelTypeCatalogPage(capabilities) &&
    capabilities.includes(capability)
  );
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

async function listActiveFuelTypes(
  tenantId: string
): Promise<FuelTypeSummary[]> {
  const { data, error } = await createWebSupabaseServiceClient()
    .from("tipos_combustible")
    .select("id, tenant_id, nombre, estado, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("estado", "activo")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FuelTypeSummary[];
}

function sanitizeFuelTypeName(formData: FormData): string {
  const value = formData.get("nombre");
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getFuelTypeId(formData: FormData): string {
  const value = formData.get("fuelTypeId");
  return typeof value === "string" ? value : "";
}

function hasConflictError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

export async function createFuelTypeAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunFuelTypeCatalogAction(
      session.effective_capabilities,
      FUEL_TYPES_CREATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const nombre = sanitizeFuelTypeName(formData);
  if (!nombre) {
    throw new Error("missing_name");
  }

  const { error } = await createWebSupabaseServiceClient()
    .from("tipos_combustible")
    .insert({ tenant_id: session.tenant_id, nombre, estado: "activo" });

  if (error) {
    if (hasConflictError(error)) {
      throw new Error("duplicate_active_name");
    }
    throw new Error("mutation_failed");
  }

  revalidatePath("/dashboard/tipos_combustible");
}

export async function updateFuelTypeAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunFuelTypeCatalogAction(
      session.effective_capabilities,
      FUEL_TYPES_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const fuelTypeId = getFuelTypeId(formData);
  const nombre = sanitizeFuelTypeName(formData);

  if (!fuelTypeId) {
    throw new Error("missing_fuel_type");
  }

  if (!nombre) {
    throw new Error("missing_name");
  }

  const { data, error } = await createWebSupabaseServiceClient()
    .from("tipos_combustible")
    .update({ nombre })
    .eq("tenant_id", session.tenant_id)
    .eq("id", fuelTypeId)
    .eq("estado", "activo")
    .select("id")
    .maybeSingle();

  if (error) {
    if (hasConflictError(error)) {
      throw new Error("duplicate_active_name");
    }
    throw new Error("mutation_failed");
  }

  if (!data) {
    throw new Error("missing_fuel_type");
  }

  revalidatePath("/dashboard/tipos_combustible");
}

export async function hideFuelTypeAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunFuelTypeCatalogAction(
      session.effective_capabilities,
      FUEL_TYPES_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const fuelTypeId = getFuelTypeId(formData);
  if (!fuelTypeId) {
    throw new Error("missing_fuel_type");
  }

  const { data, error } = await createWebSupabaseServiceClient()
    .from("tipos_combustible")
    .update({ estado: "oculto" })
    .eq("tenant_id", session.tenant_id)
    .eq("id", fuelTypeId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (hasConflictError(error)) {
      throw new Error("duplicate_active_name");
    }
    throw new Error("mutation_failed");
  }

  if (!data) {
    throw new Error("missing_fuel_type");
  }

  revalidatePath("/dashboard/tipos_combustible");
}

export default async function TiposCombustiblePage() {
  const session = await getAuthorizedPageSession();
  const [tenantName, fuelTypes] = await Promise.all([
    lookupTenantName(session.tenant_id),
    listActiveFuelTypes(session.tenant_id),
  ]);

  return renderFuelTypeCatalogShell({
    tenantName,
    capabilities: session.effective_capabilities,
    fuelTypes,
    createAction: createFuelTypeAction,
    updateAction: updateFuelTypeAction,
    hideAction: hideFuelTypeAction,
  });
}
