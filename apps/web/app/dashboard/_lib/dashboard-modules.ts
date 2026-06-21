export type DashboardModuleDefinition = {
  readonly slug: string;
  readonly href: `/dashboard/${string}`;
  readonly label: string;
  readonly description: string;
  readonly canView: (capabilities: readonly string[]) => boolean;
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

export const DASHBOARD_MODULES: readonly DashboardModuleDefinition[] = [
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
    href: "/dashboard/clientes",
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
    href: "/dashboard/tipos_combustible",
    label: "Tipos de combustible",
    description: "Consultar tipos de combustible del tenant",
    canView: (capabilities) => hasCapability(capabilities, "fuel_types:read"),
  },
];

export function getVisibleDashboardModules(
  capabilities: readonly string[]
): readonly DashboardModuleDefinition[] {
  return DASHBOARD_MODULES.filter((module) => module.canView(capabilities));
}
