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

const CATEGORIES_READ_CAPABILITY = "categories:read";
const CATEGORIES_CREATE_CAPABILITY = "categories:create";
const CATEGORIES_UPDATE_CAPABILITY = "categories:update";

type ExpenseCategorySummary = {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
};

type ExpenseCategoryCatalogShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly categories: readonly ExpenseCategorySummary[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly hideAction?: (formData: FormData) => Promise<void>;
};

export function renderExpenseCategoryCatalogShell(
  input: ExpenseCategoryCatalogShellInput
) {
  const canCreate = input.capabilities.includes(CATEGORIES_CREATE_CAPABILITY);
  const canUpdate = input.capabilities.includes(CATEGORIES_UPDATE_CAPABILITY);

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={input.capabilities}
          activeHref="/dashboard/categorias_gastos"
        />
        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Categorías de gastos
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Catálogo de categorías activas del tenant autenticado.
            </p>
          </header>

          {canCreate ? (
            <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
              <h2 className="text-xl font-semibold">Crear categoría</h2>
              <form
                action={input.createAction}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <CategoryNameField />
                <CategoryDescriptionField />
                <button className="login-button md:col-span-2" type="submit">
                  Crear categoría
                </button>
              </form>
            </section>
          ) : (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Catálogo visible en modo lectura.
            </p>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Categorías activas</h2>

            {input.categories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  Todavía no hay categorías activas.
                </p>
              </div>
            ) : null}

            {input.categories.map((category) => (
              <article
                className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                key={category.id}
              >
                <p className="font-semibold">{category.nombre}</p>
                <p className="mt-1 text-sm text-[#385346]">ID: {category.id}</p>
                {category.descripcion ? (
                  <p className="mt-1 max-w-3xl text-sm text-[#385346]">
                    {category.descripcion}
                  </p>
                ) : null}

                {canUpdate ? (
                  <>
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-2"
                    >
                      <input
                        name="categoryId"
                        type="hidden"
                        value={category.id}
                      />
                      <CategoryNameField categoryName={category.nombre} />
                      <CategoryDescriptionField
                        categoryDescription={category.descripcion ?? ""}
                      />
                      <button
                        className="login-button md:col-span-2"
                        type="submit"
                      >
                        Guardar cambios
                      </button>
                    </form>
                    <form action={input.hideAction} className="mt-4">
                      <input
                        name="categoryId"
                        type="hidden"
                        value={category.id}
                      />
                      <button
                        className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#8a1f16]"
                        type="submit"
                      >
                        Ocultar categoría
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

function CategoryNameField({
  categoryName = "",
}: {
  readonly categoryName?: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium md:col-span-2">
      <span>Nombre</span>
      <input
        className="login-input"
        name="nombre"
        required
        type="text"
        defaultValue={categoryName}
      />
    </label>
  );
}

function CategoryDescriptionField({
  categoryDescription = "",
}: {
  readonly categoryDescription?: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium md:col-span-2">
      <span>Descripción</span>
      <textarea
        className="login-input min-h-24"
        name="descripcion"
        defaultValue={categoryDescription}
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

  if (!canAccessExpenseCategoryCatalogPage(session.effective_capabilities)) {
    redirect("/dashboard");
  }

  return session;
}

export function canAccessExpenseCategoryCatalogPage(
  capabilities: readonly string[]
): boolean {
  return capabilities.includes(CATEGORIES_READ_CAPABILITY);
}

export function canRunExpenseCategoryCatalogAction(
  capabilities: readonly string[],
  capability: string
): boolean {
  return (
    canAccessExpenseCategoryCatalogPage(capabilities) &&
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

async function listActiveCategories(tenantId: string) {
  const { data, error } = await createWebSupabaseServiceClient()
    .from("categorias_gastos")
    .select("id,nombre,descripcion")
    .eq("tenant_id", tenantId)
    .eq("estado", "activo")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ExpenseCategorySummary[];
}

function sanitizeCategoryName(formData: FormData): string {
  const value = formData.get("nombre");
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeOptionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function getCategoryId(formData: FormData): string {
  const value = formData.get("categoryId");
  return typeof value === "string" ? value : "";
}

function assertNoConflict(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  ) {
    throw new Error("duplicate_active_name");
  }

  throw new Error("mutation_failed");
}

export async function createExpenseCategoryAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunExpenseCategoryCatalogAction(
      session.effective_capabilities,
      CATEGORIES_CREATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const nombre = sanitizeCategoryName(formData);
  if (!nombre) throw new Error("missing_name");
  const descripcion = sanitizeOptionalText(formData, "descripcion");

  const { error } = await createWebSupabaseServiceClient()
    .from("categorias_gastos")
    .insert({
      tenant_id: session.tenant_id,
      nombre,
      descripcion,
      estado: "activo",
    });

  if (error) assertNoConflict(error);

  revalidatePath("/dashboard/categorias_gastos");
}

export async function updateExpenseCategoryAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunExpenseCategoryCatalogAction(
      session.effective_capabilities,
      CATEGORIES_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const categoryId = getCategoryId(formData);
  const nombre = sanitizeCategoryName(formData);
  const descripcion = sanitizeOptionalText(formData, "descripcion");

  if (!categoryId) throw new Error("missing_category");
  if (!nombre) throw new Error("missing_name");

  const { data, error } = await createWebSupabaseServiceClient()
    .from("categorias_gastos")
    .update({ nombre, descripcion })
    .eq("tenant_id", session.tenant_id)
    .eq("id", categoryId)
    .eq("estado", "activo")
    .select("id")
    .maybeSingle();

  if (error) assertNoConflict(error);
  if (!data) throw new Error("missing_category");

  revalidatePath("/dashboard/categorias_gastos");
}

export async function hideExpenseCategoryAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();

  if (
    !canRunExpenseCategoryCatalogAction(
      session.effective_capabilities,
      CATEGORIES_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }

  const categoryId = getCategoryId(formData);
  if (!categoryId) throw new Error("missing_category");

  const { data, error } = await createWebSupabaseServiceClient()
    .from("categorias_gastos")
    .update({ estado: "oculto" })
    .eq("tenant_id", session.tenant_id)
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (error) assertNoConflict(error);
  if (!data) throw new Error("missing_category");

  revalidatePath("/dashboard/categorias_gastos");
}

export default async function ExpenseCategoriesPage() {
  const session = await getAuthorizedPageSession();
  const [tenantName, categories] = await Promise.all([
    lookupTenantName(session.tenant_id),
    listActiveCategories(session.tenant_id),
  ]);

  return renderExpenseCategoryCatalogShell({
    tenantName,
    capabilities: session.effective_capabilities,
    categories,
    createAction: createExpenseCategoryAction,
    updateAction: updateExpenseCategoryAction,
    hideAction: hideExpenseCategoryAction,
  });
}
