import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SupabaseAppSessionRepository } from "@faena360/infrastructure";
import type { AppSession } from "@faena360/domain";
import { createWebSupabaseServiceClient } from "../../lib/supabase";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../lib/auth/session";
import { DashboardSidebar } from "./_components/dashboard-sidebar";

type TenantLookup = (tenantId: string) => Promise<{
  readonly id: string;
  readonly name: string;
  readonly status: string;
}>;

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
  viewModel: Exclude<DashboardViewModel, { redirectTo: "/" }>,
  activeHref: "/dashboard" | `/dashboard/${string}` = "/dashboard"
) {
  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={viewModel.effectiveCapabilities}
          activeHref={activeHref}
        />

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
