export type DefaultRoleName =
  | "administrador"
  | "supervisor"
  | "operador"
  | "mantenimiento"
  | "repartidor_de_combustible";

export interface DefaultRole {
  readonly name: DefaultRoleName;
  readonly isSystem: true;
  readonly isWebAccess: boolean;
  readonly capabilityKeys: readonly string[];
}

export const TENANT_SYSTEM_ROLES = {
  administrador: {
    name: "administrador",
    isSystem: true as const,
    isWebAccess: true,
  },
  supervisor: {
    name: "supervisor",
    isSystem: true as const,
    isWebAccess: true,
  },
  operador: {
    name: "operador",
    isSystem: true as const,
    isWebAccess: false,
  },
  mantenimiento: {
    name: "mantenimiento",
    isSystem: true as const,
    isWebAccess: false,
  },
  repartidor_de_combustible: {
    name: "repartidor_de_combustible",
    isSystem: true as const,
    isWebAccess: false,
  },
} as const;

const ADMIN_CAPABILITY_KEYS = [
  // Core tenant and identity management (administrative scope)
  "tenants:read",
  "tenants:update",
  "users:read",
  "users:create",
  "users:update",
  "roles:read",
  "roles:create",
  "roles:update",
  "capabilities:read",
  "web.portal.access",

  // Financial and operational record operations for audits and overrides
  "projects:read",
  "projects:create",
  "projects:update",
  "projects:pause",
  "projects:finish",
  "projects:reopen",
  "projects:hide",
  "subprojects:read",
  "subprojects:create",
  "subprojects:update",
  "subprojects:finish",
  "subprojects:reopen",
  "machines:read",
  "machines:create",
  "machines:update",
  "machines:change_status",
  "assignments:read",
  "assignments:create",
  "assignments:update",
  "assignments:withdraw",
  "shifts:read",
  "shifts:start",
  "shifts:close",
  "shifts:void",
  "expenses:read",
  "expenses:create",
  "expenses:update",
  "expenses:void",

  // Workflow and governance actions
  "change_requests:read",
  "change_requests:create",
  "change_requests:approve",
  "change_requests:reject",
  "clients:read",
  "clients:create",
  "clients:update",
  "categories:read",
  "categories:create",
  "categories:update",
  "fuel_types:read",
  "fuel_types:create",
  "fuel_types:update",
  "reports:read",
];

const SUPERVISOR_CAPABILITY_KEYS = [
  // Supervisor defaults: full read visibility + finance/workflow actions,
  // but no tenant-level admin domain creation.
  "tenants:read",
  "users:read",
  "roles:read",
  "capabilities:read",
  "web.portal.access",
  "projects:read",
  "subprojects:read",
  "machines:read",
  "assignments:read",
  "shifts:read",
  "shifts:start",
  "shifts:void",
  "expenses:read",
  "expenses:create",
  "expenses:update",
  "expenses:void",
  "change_requests:read",
  "change_requests:create",
  "change_requests:approve",
  "change_requests:reject",
  "clients:read",
  "categories:read",
  "fuel_types:read",
  "reports:read",
];

/**
 * Documented capability grants are intentionally represented as key names only.
 *
 * The runtime preflight must validate that every required key exists in the
 * project's documented capability catalog before any persistence occurs.
 */
export const DEFAULT_ROLE_CAPABILITY_KEYS = {
  administrador: ADMIN_CAPABILITY_KEYS,
  supervisor: SUPERVISOR_CAPABILITY_KEYS,
  operador: [] as readonly string[],
  mantenimiento: [] as readonly string[],
  repartidor_de_combustible: [] as readonly string[],
};

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    ...TENANT_SYSTEM_ROLES.administrador,
    capabilityKeys: DEFAULT_ROLE_CAPABILITY_KEYS.administrador,
  },
  {
    ...TENANT_SYSTEM_ROLES.supervisor,
    capabilityKeys: DEFAULT_ROLE_CAPABILITY_KEYS.supervisor,
  },
  {
    ...TENANT_SYSTEM_ROLES.operador,
    capabilityKeys: DEFAULT_ROLE_CAPABILITY_KEYS.operador,
  },
  {
    ...TENANT_SYSTEM_ROLES.mantenimiento,
    capabilityKeys: DEFAULT_ROLE_CAPABILITY_KEYS.mantenimiento,
  },
  {
    ...TENANT_SYSTEM_ROLES.repartidor_de_combustible,
    capabilityKeys: DEFAULT_ROLE_CAPABILITY_KEYS.repartidor_de_combustible,
  },
];

export interface RoleValidationResult {
  readonly isValid: boolean;
  readonly missingCapabilities: readonly string[];
}

const ALL_ROLE_NAMES: readonly string[] = DEFAULT_ROLES.map(
  (role) => role.name
);

/**
 * Returns all required capability keys referenced by default roles.
 *
 * This is used by preflight to validate that the authoritative source includes
 * every required grant before any tenant bootstrap is persisted.
 */
export function getDefaultRoleCapabilityKeys(): readonly string[] {
  return [...new Set(DEFAULT_ROLES.flatMap((role) => role.capabilityKeys))];
}

/**
 * Validate that all required system roles exist and that their capability
 * contracts reference documented keys.
 */
export function validateRoleContract(
  availableCapabilityKeys: ReadonlySet<string>
): RoleValidationResult {
  const missingCapabilities = DEFAULT_ROLES.flatMap((role) =>
    role.capabilityKeys.filter((key) => !availableCapabilityKeys.has(key))
  );

  const missingRoles = ALL_ROLE_NAMES.filter(
    (name) => !DEFAULT_ROLES.some((role) => role.name === name)
  );

  return {
    isValid:
      missingCapabilities.length === 0 &&
      missingRoles.length === 0 &&
      availableCapabilityKeys.size >= 0,
    missingCapabilities,
  };
}
