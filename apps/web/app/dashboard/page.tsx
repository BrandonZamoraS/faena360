import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SupabaseAppSessionRepository } from "@faena360/infrastructure";
import type { AppSession } from "@faena360/domain";
import { createWebSupabaseServiceClient } from "../../lib/supabase";
import {
  APP_SESSION_COOKIE_NAME,
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../lib/auth/session";

type TenantLookup = (tenantId: string) => Promise<{
  readonly id: string;
  readonly name: string;
  readonly status: string;
}>;

export type CatalogValidationError = {
  readonly field?: string;
  readonly code: string;
  readonly message: string;
};

type DashboardModuleDefinition = {
  readonly slug: string;
  readonly href: `/dashboard/${string}`;
  readonly label: string;
  readonly description: string;
  readonly canView: (capabilities: readonly string[]) => boolean;
};

export type DashboardViewModel =
  | {
      readonly redirectTo: "/";
    }
  | {
      readonly tenantName: string;
      readonly userEmail: string;
      readonly roles: readonly string[];
      readonly effectiveCapabilities: readonly string[];
    };

const USER_READ_CAPABILITY = "users:read";
const USER_ADMIN_MODULE_CAPABILITIES = ["users:create", "users:update"];

function hasCapability(capabilities: readonly string[], capability: string) {
  return capabilities.includes(capability);
}

function canAccessUserAdminModule(capabilities: readonly string[]) {
  return (
    hasCapability(capabilities, USER_READ_CAPABILITY) &&
    USER_ADMIN_MODULE_CAPABILITIES.some((capability) =>
      hasCapability(capabilities, capability)
    )
  );
}

const DASHBOARD_MODULES: readonly DashboardModuleDefinition[] = [
  {
    slug: "admin_usuarios",
    href: "/dashboard/admin_usuarios",
    label: "admin_usuarios",
    description: "Crear y administrar usuarios",
    canView: canAccessUserAdminModule,
  },
  {
    slug: "projects",
    href: "/dashboard/projects",
    label: "Proyectos",
    description: "Consultar proyectos del tenant",
    canView: (capabilities) => hasCapability(capabilities, "projects:read"),
  },
  {
    slug: "subprojects",
    href: "/dashboard/subprojects",
    label: "Subproyectos",
    description: "Consultar subproyectos del tenant",
    canView: (capabilities) => hasCapability(capabilities, "subprojects:read"),
  },
  {
    slug: "machines",
    href: "/dashboard/machines",
    label: "Maquinaria",
    description: "Consultar maquinaria del tenant",
    canView: (capabilities) => hasCapability(capabilities, "machines:read"),
  },
  {
    slug: "clients",
    href: "/dashboard/clients",
    label: "Clientes",
    description: "Consultar clientes del tenant",
    canView: (capabilities) => hasCapability(capabilities, "clients:read"),
  },
  {
    slug: "categories",
    href: "/dashboard/categories",
    label: "Categorías",
    description: "Consultar categorías del tenant",
    canView: (capabilities) => hasCapability(capabilities, "categories:read"),
  },
  {
    slug: "fuel_types",
    href: "/dashboard/fuel_types",
    label: "Tipos de combustible",
    description: "Consultar tipos de combustible del tenant",
    canView: (capabilities) => hasCapability(capabilities, "fuel_types:read"),
  },
];

export async function createDashboardViewModel(input: {
  readonly session: AppSession | null;
  readonly searchParams: Record<string, unknown>;
  readonly tenantLookup: TenantLookup;
}): Promise<DashboardViewModel> {
  if (
    !input.session ||
    !input.session.can_access_web ||
    !input.session.effective_capabilities.includes("web.portal.access")
  ) {
    return { redirectTo: "/" };
  }

  const tenant = await input.tenantLookup(input.session.tenant_id);

  if (tenant.status !== "active") {
    return { redirectTo: "/" };
  }

  return {
    tenantName: tenant.name,
    userEmail: input.session.email,
    roles: input.session.roles,
    effectiveCapabilities: input.session.effective_capabilities,
  };
}

export function renderDashboardShell(
  viewModel: Exclude<DashboardViewModel, { redirectTo: "/" }>
) {
  const visibleModules = DASHBOARD_MODULES.filter((module) =>
    module.canView(viewModel.effectiveCapabilities)
  );

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="flex border-b border-[#dcebe1] bg-[#edf5ec] px-6 py-6 lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <p className="text-sm font-semibold text-[#173b29]">Faena360</p>
          <nav className="mt-8 space-y-2" aria-label="Módulos">
            <a
              className="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white"
              href="/dashboard"
            >
              Dashboard
            </a>
            {visibleModules.map((module) => (
              <a
                key={module.slug}
                className="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] transition hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f7044]"
                href={module.href}
              >
                <span className="block">{module.label}</span>
                <span className="mt-1 block text-xs font-medium text-[#385346]">
                  {module.description}
                </span>
              </a>
            ))}
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
          <header className="rounded-[2rem] border border-[#dcebe1] bg-white p-8 shadow-sm">
            <p className="text-sm font-medium text-[#0f5132]">Dashboard</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
                  {viewModel.tenantName}
                </h1>
                <p className="mt-3 text-base leading-7 text-[#385346]">
                  Sesión activa para {viewModel.userEmail}.
                </p>
              </div>
              <p className="rounded-full bg-[#e5f6ea] px-4 py-2 text-sm font-medium text-[#0f5132]">
                Roles: {viewModel.roles.join(", ")}
              </p>
            </div>
          </header>

          <section className="rounded-[2rem] border border-dashed border-[#b8d8c2] bg-white/80 p-10 text-center">
            <p className="text-lg font-semibold text-[#102118]">
              No hay módulos operativos publicados todavía.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#385346]">
              Este espacio queda preparado para futuras métricas, usuarios y
              módulos del tenant autenticado.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}

export async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(APP_SESSION_COOKIE_NAME);
  redirect("/");
}

async function lookupTenant(tenantId: string) {
  const supabase = createWebSupabaseServiceClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, status")
    .eq("id", tenantId)
    .maybeSingle<{ id: string; name: string; status: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Tenant not found");
  }

  return data;
}

async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const repository = new SupabaseAppSessionRepository(
    createWebSupabaseServiceClient()
  );
  const authResult = await requireWebAccess(cookieStore, {
    sessionRefresher: createServerStateSessionRefresher(repository),
  });

  if (!authResult.ok) {
    return null;
  }

  return authResult.session;
}

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, unknown>>;
}) {
  const session = await getSessionFromCookies();
  const viewModel = await createDashboardViewModel({
    session,
    searchParams: searchParams ? await searchParams : {},
    tenantLookup: lookupTenant,
  });

  if ("redirectTo" in viewModel) {
    redirect(viewModel.redirectTo);
  }

  return renderDashboardShell(viewModel);
}
