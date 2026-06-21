import { getVisibleDashboardModules } from "../_lib/dashboard-modules";
import { logoutAction } from "../_actions/logout";

const DASHBOARD_NAV_BASE_CLASS =
  "block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] transition hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f7044]";
const DASHBOARD_NAV_ACTIVE_CLASS =
  "block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white";

type DashboardSidebarProps = {
  readonly capabilities: readonly string[];
  readonly activeHref: "/dashboard" | `/dashboard/${string}`;
};

export function DashboardSidebar({
  capabilities,
  activeHref,
}: DashboardSidebarProps) {
  const modules = getVisibleDashboardModules(capabilities);
  const isDashboardActive = activeHref === "/dashboard";

  return (
    <aside className="flex border-b border-[#dcebe1] bg-[#edf5ec] px-6 py-6 lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
      <p className="text-sm font-semibold text-[#173b29]">Faena360</p>
      <nav className="mt-8 space-y-2" aria-label="Módulos">
        <a
          className={
            isDashboardActive
              ? DASHBOARD_NAV_ACTIVE_CLASS
              : DASHBOARD_NAV_BASE_CLASS
          }
          href="/dashboard"
        >
          Dashboard
        </a>

        {modules.map((module) => {
          const isActive = module.href === activeHref;

          return (
            <a
              key={module.slug}
              className={isActive ? DASHBOARD_NAV_ACTIVE_CLASS : DASHBOARD_NAV_BASE_CLASS}
              href={module.href}
            >
              <span className="block">{module.label}</span>
              <span className="mt-1 block text-xs font-medium text-[#385346]">
                {module.description}
              </span>
            </a>
          );
        })}
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
  );
}
