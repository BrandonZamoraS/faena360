import {
  DEFAULT_ROLES,
  getDefaultRoleCapabilityKeys,
  validateRoleContract,
  type RoleValidationResult,
} from "./default-role-bootstrap";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

export type FuelUnit = "liters" | "gallons_us" | "gallons_imperial";

export type TenantInputs = {
  readonly name: string;
  readonly slug: string;
  readonly timezone: string;
  readonly currency: string;
  readonly fuelUnit: FuelUnit;
};

export type AdminInputs = {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly fullName: string;
  readonly phone?: string;
};

export type TenantOnboardingRequest = {
  readonly tenant: TenantInputs;
  readonly admin: AdminInputs;
};

export type ValidationIssue = {
  readonly field: string;
  readonly message: string;
};

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export type PreflightIssue = {
  readonly field: string;
  readonly message: string;
};

export type PreflightResult = {
  readonly ok: boolean;
  readonly issues: readonly PreflightIssue[];
};

export interface PreflightClients {
  readonly tenantSlugExists: (slug: string) => Promise<boolean>;
  readonly authIdentityExistsByEmail: (email: string) => Promise<boolean>;
  readonly localProfileExistsByEmail: (email: string) => Promise<boolean>;
  readonly capabilityKeysExist: (
    keys: readonly string[]
  ) => Promise<Set<string>>;
}

const TIMEZONE_FALLBACK = new Set([
  "UTC",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Mexico_City",
  "Europe/Madrid",
  "Europe/London",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toSupportedTimezone(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (typeof Intl.supportedValuesOf === "function") {
    const zones = new Set(Intl.supportedValuesOf("timeZone"));
    if (zones.has(trimmed)) {
      return trimmed;
    }
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions()
      .timeZone;
  } catch {
    return TIMEZONE_FALLBACK.has(trimmed) ? trimmed : "";
  }
}

function toSupportedCurrency(value: string): string {
  const trimmed = value.trim().toUpperCase();

  if (!trimmed) {
    return "";
  }

  if (typeof Intl.supportedValuesOf === "function") {
    const currencies = new Set(Intl.supportedValuesOf("currency"));
    return currencies.has(trimmed) ? trimmed : "";
  }

  const fallback = new Set(["USD", "EUR", "ARS", "MXN", "BRL", "COP", "UYU"]);
  return fallback.has(trimmed) ? trimmed : "";
}

function toSlug(name: string, providedSlug: string): string {
  const base = (providedSlug.trim() || name).trim().toLowerCase();
  return base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function hasValue(value: string): value is string {
  return value.length > 0;
}

export function parseTenantInputs(raw: unknown): ParseResult<TenantInputs> {
  if (!isObject(raw)) {
    return {
      ok: false,
      issues: [
        { field: "tenant", message: "Tenant payload must be an object." },
      ],
    };
  }

  const name = toTrimmed(raw.name);
  const slugInput = toTrimmed(raw.slug);
  const timezoneInput = toTrimmed(raw.timezone);
  const currencyInput = toTrimmed(raw.currency);
  const fuelUnit = toTrimmed(raw.fuelUnit);

  const issues: ValidationIssue[] = [];

  if (!hasValue(name)) {
    issues.push({ field: "tenant.name", message: "Tenant name is required." });
  }

  const slug = toSlug(name, slugInput);
  if (!/^([a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(slug) || !hasValue(slug)) {
    issues.push({
      field: "tenant.slug",
      message:
        "Tenant slug must be lowercase and slug-safe (letters/numbers/hyphens).",
    });
  }

  const timezone = toSupportedTimezone(timezoneInput);
  if (!hasValue(timezone)) {
    issues.push({
      field: "tenant.timezone",
      message: "Tenant timezone must be a valid IANA timezone identifier.",
    });
  }

  const currency = toSupportedCurrency(currencyInput);
  if (!hasValue(currency)) {
    issues.push({
      field: "tenant.currency",
      message: "Tenant currency must be a valid ISO-4217 currency code.",
    });
  }

  const validFuelUnits: readonly string[] = [
    "liters",
    "gallons_us",
    "gallons_imperial",
  ];
  if (!validFuelUnits.includes(fuelUnit)) {
    issues.push({
      field: "tenant.fuelUnit",
      message: "fuelUnit must be liters, gallons_us, or gallons_imperial.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      name,
      slug,
      timezone,
      currency,
      fuelUnit: fuelUnit as FuelUnit,
    },
  };
}

export function parseAdminInputs(raw: unknown): ParseResult<AdminInputs> {
  if (!isObject(raw)) {
    return {
      ok: false,
      issues: [{ field: "admin", message: "Admin payload must be an object." }],
    };
  }

  const email = toTrimmed(raw.email).toLowerCase();
  const temporaryPassword = toTrimmed(raw.temporaryPassword);
  const fullName = toTrimmed(raw.fullName);
  const phone = toTrimmed(raw.phone);

  const issues: ValidationIssue[] = [];

  if (!hasValue(email) || !isValidEmail(email)) {
    issues.push({
      field: "admin.email",
      message: "A valid admin email is required.",
    });
  }

  if (!hasValue(temporaryPassword) || temporaryPassword.length < 6) {
    issues.push({
      field: "admin.temporaryPassword",
      message: "temporaryPassword must be at least 6 characters.",
    });
  }

  if (!hasValue(fullName)) {
    issues.push({
      field: "admin.fullName",
      message: "admin.fullName is required for initial profile data.",
    });
  }

  if (hasValue(phone) && /\+?-?\d[\d\s.-]{4,}$/.test(phone) === false) {
    issues.push({
      field: "admin.phone",
      message: "admin.phone must be empty or a valid phone-like value.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      email,
      temporaryPassword,
      fullName,
      ...(phone ? { phone } : {}),
    },
  };
}

export function parseTenantOnboardingRequest(
  raw: unknown
): ParseResult<TenantOnboardingRequest> {
  if (!isObject(raw)) {
    return {
      ok: false,
      issues: [
        {
          field: "root",
          message: "Request payload must include tenant and admin objects.",
        },
      ],
    };
  }

  const tenantResult = parseTenantInputs((raw as { tenant?: unknown }).tenant);
  if (!tenantResult.ok) {
    return { ok: false, issues: tenantResult.issues };
  }

  const adminResult = parseAdminInputs((raw as { admin?: unknown }).admin);
  if (!adminResult.ok) {
    return { ok: false, issues: adminResult.issues };
  }

  return {
    ok: true,
    value: {
      tenant: tenantResult.value,
      admin: adminResult.value,
    },
  };
}

export function parseTenantOnboardingRequestFromJson(
  payload: string
): ParseResult<TenantOnboardingRequest> {
  try {
    const raw = JSON.parse(payload.replace(/^\uFEFF/, "")) as unknown;
    return parseTenantOnboardingRequest(raw);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          field: "payload",
          message:
            error instanceof Error ? error.message : "Invalid JSON payload.",
        },
      ],
    };
  }
}

export function buildIdempotencyMarkers(request: TenantOnboardingRequest): {
  tenantSlug: string;
  adminEmail: string;
  fingerprint: string;
} {
  const tenantSlug = request.tenant.slug.toLowerCase();
  const adminEmail = request.admin.email.toLowerCase();
  const fingerprint = `${tenantSlug}|${adminEmail}`;

  return {
    tenantSlug,
    adminEmail,
    fingerprint,
  };
}

export function validateCapabilityContracts(): RoleValidationResult {
  const requiredKeys = getDefaultRoleCapabilityKeys();
  const uniqueKeys = new Set(requiredKeys);

  return {
    isValid: uniqueKeys.size > 0,
    missingCapabilities: uniqueKeys.size > 0 ? [] : requiredKeys,
  };
}

export function validateRoleContractAgainstSource(
  existingCapabilityKeys: ReadonlySet<string>
): RoleValidationResult {
  const contract = validateRoleContract(existingCapabilityKeys);
  return {
    isValid: contract.isValid && contract.missingCapabilities.length === 0,
    missingCapabilities: contract.missingCapabilities,
  };
}

export async function runPreflightChecks(
  request: TenantOnboardingRequest,
  clients: PreflightClients
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];

  const { tenantSlug, adminEmail } = buildIdempotencyMarkers(request);

  const tenantExists = await clients.tenantSlugExists(tenantSlug);
  if (tenantExists) {
    issues.push({
      field: "tenant.slug",
      message: `Tenant slug \"${tenantSlug}\" already exists.`,
    });
  }

  const profileExists = await clients.localProfileExistsByEmail(adminEmail);
  if (profileExists) {
    issues.push({
      field: "admin.email",
      message: `Local profile already exists for email \"${adminEmail}\".`,
    });
  }

  const authIdentityExists =
    await clients.authIdentityExistsByEmail(adminEmail);
  if (authIdentityExists) {
    issues.push({
      field: "admin.email",
      message: `Auth identity already exists for email \"${adminEmail}\".`,
    });
  }

  const requiredCapabilityKeys = getDefaultRoleCapabilityKeys();
  if (requiredCapabilityKeys.length === 0) {
    issues.push({
      field: "roles",
      message:
        "Default role capability mapping is not configured (all default role grants are empty), blocking onboarding.",
    });
    return {
      ok: false,
      issues,
    };
  }

  const existingKeys = await clients.capabilityKeysExist(
    requiredCapabilityKeys
  );
  const roleContract = validateRoleContractAgainstSource(existingKeys);
  if (!roleContract.isValid) {
    const missingKeys = roleContract.missingCapabilities;

    issues.push({
      field: "roles",
      message: `Role contract is incomplete: missing capability keys ${missingKeys.join(", ")}`,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export type OnboardingClients = {
  readonly tenantBySlugExists: (slug: string) => Promise<boolean>;
  readonly authUserByEmailExists: (email: string) => Promise<boolean>;
  readonly localProfileByEmailExists: (email: string) => Promise<boolean>;
  readonly capabilitiesByKeys: (
    keys: readonly string[]
  ) => Promise<Set<string>>;
  readonly createTenant: (request: TenantInputs) => Promise<string>;
  readonly createAuthUser: (tenantId: string, admin: AdminInputs) => Promise<string>;
  readonly createProfile: (
    tenantId: string,
    authUserId: string,
    admin: AdminInputs
  ) => Promise<string>;
  readonly createRoles: (tenantId: string) => Promise<ReadonlyMap<string, string>>;
  readonly mapCapabilitiesToRoles: (
    tenantId: string,
    roleIdsByName: ReadonlyMap<string, string>,
    availableCapabilityIds: ReadonlyMap<string, string>
  ) => Promise<void>;
  readonly assignAdminRole: (tenantId: string, profileId: string) => Promise<string>;
};

type ProvisionedState = {
  tenantId?: string;
  authUserId?: string;
  profileId?: string;
  roleIds: string[];
  grantedRoleIds: string[];
  adminRoleId?: string;
  adminUserRoleId?: string;
};

type RollbackError = {
  readonly step: string;
  readonly message: string;
};

type OnboardingResult = {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly authUserId: string;
  readonly profileId: string;
  readonly roleCount: number;
};

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseJsonPayloadArgument(args: string[]): string | null {
  const payloadArgIndex = args.findIndex((value) => value === "--payload");
  if (payloadArgIndex >= 0 && args[payloadArgIndex + 1]) {
    return args[payloadArgIndex + 1];
  }

  const fileArgIndex = args.findIndex(
    (value) => value === "--payload-file" || value === "--payloadPath"
  );
  if (fileArgIndex >= 0 && args[fileArgIndex + 1]) {
    return `[payload-file:${args[fileArgIndex + 1]}]`;
  }

  return null;
}

async function resolvePayloadFromInput(args: string[]): Promise<ParseResult<string>> {
  const inlinePayload = parseJsonPayloadArgument(args);

  if (inlinePayload && !inlinePayload.startsWith("[payload-file:")) {
    return { ok: true, value: inlinePayload };
  }

  if (inlinePayload && inlinePayload.startsWith("[payload-file:")) {
    const start = inlinePayload.indexOf(":") + 1;
    const end = inlinePayload.lastIndexOf("]");
    const filePath = inlinePayload.slice(start, end);

    try {
      const filePayload = await readFile(filePath, "utf8");
      if (filePayload.trim().length === 0) {
        return {
          ok: false,
          issues: [
            {
              field: "payload",
              message: "Payload file is empty.",
            },
          ],
        };
      }

      return { ok: true, value: filePayload };
    } catch (error) {
      return {
        ok: false,
        issues: [
          {
            field: "payload",
            message: `Could not read payload file: ${normalizeErrorMessage(error)}`,
          },
        ],
      };
    }
  }

  if (!process.stdin.isTTY) {
    const stdinPayload = await readStdinPayload();
    if (stdinPayload.trim()) {
      return { ok: true, value: stdinPayload };
    }
  }

  return {
    ok: false,
    issues: [
      {
        field: "payload",
        message:
          "Missing onboarding payload. Provide --payload <json>, --payload-file <path>, or pipe a JSON payload through stdin.",
      },
    ],
  };
}

async function readStdinPayload(): Promise<string> {
  const lineReader = createInterface({
    input: process.stdin,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  const lines: string[] = [];
  for await (const line of lineReader) {
    lines.push(line);
  }

  return lines.join("\n");
}

function formatPreflightIssues(issues: readonly PreflightIssue[]): string {
  return issues.map((issue) => `${issue.field}: ${issue.message}`).join("\n");
}

function buildSupabaseClients(url: string, serviceRoleKey: string): {
  readonly preflightClients: PreflightClients;
  readonly onboardClients: OnboardingClients;
  readonly admin: SupabaseClient;
} {
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const preflightClients: PreflightClients = {
    tenantSlugExists: async (slug) => {
      const { count, error } = await admin
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug);

      if (error) {
        throw new Error(`tenant slug preflight failed: ${error.message}`);
      }

      return (count ?? 0) > 0;
    },
    localProfileExistsByEmail: async (email) => {
      const { count, error } = await admin
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("email", email);

      if (error) {
        throw new Error(`local profile preflight failed: ${error.message}`);
      }

      return (count ?? 0) > 0;
    },
    authIdentityExistsByEmail: async (email) => {
      const normalized = email.toLowerCase();
      let page = 1;
      const perPage = 200;

      while (true) {
        const response = await admin.auth.admin.listUsers({ page, perPage });
        if (response.error) {
          throw new Error(`auth identity preflight failed: ${response.error.message}`);
        }

        const users = response.data?.users ?? [];
        const found = users.some(
          (item: { email?: string | null }) =>
            (item.email?.toLowerCase?.() ?? "") === normalized
        );

        if (found) {
          return true;
        }

        if (users.length < perPage) {
          return false;
        }

        page += 1;
      }
    },
    capabilityKeysExist: async (keys) => {
      if (keys.length === 0) {
        return new Set<string>();
      }

      const { data, error } = await admin
        .from("capabilities")
        .select("key")
        .in("key", keys);

      if (error) {
        throw new Error(`capability mapping preflight failed: ${error.message}`);
      }

        return new Set(
          (data ?? []).map((row: { key: string }) => row.key)
        );
    },
  };

  const onboardClients: OnboardingClients = {
    tenantBySlugExists: preflightClients.tenantSlugExists,
    authUserByEmailExists: preflightClients.authIdentityExistsByEmail,
    localProfileByEmailExists: preflightClients.localProfileExistsByEmail,
    capabilitiesByKeys: preflightClients.capabilityKeysExist,
    createTenant: async (tenant) => {
      const { data, error } = await admin
        .from("tenants")
        .insert({
          name: tenant.name,
          slug: tenant.slug,
          timezone: tenant.timezone,
          currency: tenant.currency,
          fuel_unit: tenant.fuelUnit,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to create tenant: ${error.message}`);
      }

      if (!data) {
        throw new Error("Failed to create tenant: no tenant row returned.");
      }

      return data.id;
    },
    createAuthUser: async (tenantId, adminIdentity) => {
      const { data, error } = await adminClient().auth.admin.createUser({
        email: adminIdentity.email,
        password: adminIdentity.temporaryPassword,
        app_metadata: {
          tenant_id: tenantId,
        },
      });

      if (error || !data?.user) {
        throw new Error(
          `Failed to create auth user: ${error?.message ?? "missing response"}`
        );
      }

      return data.user.id;
    },
    createProfile: async (tenantId, authUserId, adminProfile) => {
      const payload = {
        tenant_id: tenantId,
        auth_user_id: authUserId,
        email: adminProfile.email,
        full_name: adminProfile.fullName,
        ...(adminProfile.phone ? { phone: adminProfile.phone } : {}),
      } as const;

      const { data, error } = await admin
        .from("user_profiles")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to create admin profile: ${error.message}`);
      }

      if (!data) {
        throw new Error("Failed to create admin profile: no profile row returned.");
      }

      return data.id;
    },
    createRoles: async (tenantId) => {
      const rolesToCreate = DEFAULT_ROLES.map((role) => ({
        tenant_id: tenantId,
        name: role.name,
        is_system: role.isSystem,
        is_web_access: role.isWebAccess,
      }));

      const { data, error } = await admin
        .from("roles")
        .insert(rolesToCreate)
        .select("id,name");

      if (error) {
        throw new Error(`Failed to create default roles: ${error.message}`);
      }

      const created = (data ?? []) as ReadonlyArray<{ readonly id: string; readonly name: string }>;

      const byName = new Map<string, string>(
        created.map((role) => [role.name, role.id])
      );

      for (const expected of DEFAULT_ROLES) {
        if (!byName.has(expected.name)) {
          throw new Error(`Missing created role in DB: ${expected.name}`);
        }
      }

      return byName;
    },
    mapCapabilitiesToRoles: async (_tenantId, roleIdsByName, capabilityIdsByKey) => {
      const assignments: Array<{ role_id: string; capability_id: string }> = [];

      for (const role of DEFAULT_ROLES) {
        const roleId = roleIdsByName.get(role.name);
        if (!roleId) {
          throw new Error(`Cannot seed capability grants; missing role id for ${role.name}.`);
        }

        for (const capabilityKey of role.capabilityKeys) {
          const capabilityId = capabilityIdsByKey.get(capabilityKey);
          if (!capabilityId) {
            throw new Error(
              `Missing capability mapping for key "${capabilityKey}" while creating role grants.`
            );
          }

          assignments.push({ role_id: roleId, capability_id: capabilityId });
        }
      }

      if (assignments.length === 0) {
        return;
      }

      const { error } = await admin
        .from("role_capabilities")
        .insert(assignments as Array<{ role_id: string; capability_id: string }>);

      if (error) {
        throw new Error(`Failed to create role capability assignments: ${error.message}`);
      }
    },
    assignAdminRole: async (tenantId, profileId) => {
      const { data: roles, error: rolesError } = await admin
        .from("roles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", "administrador")
        .single();

      if (rolesError || !roles) {
        throw new Error(
          `Failed to resolve administrador role: ${rolesError?.message ?? "missing role row"}`
        );
      }

      const { error } = await admin.from("user_roles").insert({
        tenant_id: tenantId,
        user_id: profileId,
        role_id: roles.id,
      });

      if (error) {
        throw new Error(`Failed to assign administrador role: ${error.message}`);
      }

      return roles.id;
    },
  };

  function adminClient(): SupabaseClient {
    return admin;
  }

  return { preflightClients, onboardClients, admin };
}

async function loadCapabilities(admin: SupabaseClient): Promise<ReadonlyMap<string, string>> {
  const requiredKeys = getDefaultRoleCapabilityKeys();
  const { data, error } = await admin
    .from("capabilities")
    .select("id,key")
    .in("key", requiredKeys);

  if (error) {
    throw new Error(`Failed to load capability IDs: ${error.message}`);
  }

  return new Map((data ?? []).map((row: { key: string; id: string }) => [row.key, row.id]));
}

function extractRollbackErrors(errors: readonly RollbackError[]): void {
  if (errors.length === 0) {
    return;
  }

  const message = errors
    .map((entry) => `${entry.step}: ${entry.message}`)
    .join("; ");
  throw new Error(`Rollback reported issues: ${message}`);
}

async function rollbackOnFailure(
  admin: SupabaseClient,
  state: ProvisionedState
): Promise<void> {
  const errors: RollbackError[] = [];

  const guard = (step: string, action: () => Promise<unknown>) =>
    action().catch((error) => {
      errors.push({ step, message: normalizeErrorMessage(error) });
    });

  await guard("delete user_roles", async () => {
    if (!state.tenantId || !state.profileId || !state.adminUserRoleId) {
      return;
    }

    await admin
      .from("user_roles")
      .delete()
      .eq("tenant_id", state.tenantId)
      .eq("user_id", state.profileId)
      .eq("role_id", state.adminUserRoleId);
  });

  await guard("delete role_capabilities", async () => {
    if (state.grantedRoleIds.length === 0) {
      return;
    }

    await admin
      .from("role_capabilities")
      .delete()
      .in("role_id", state.grantedRoleIds);
  });

  await guard("delete roles", async () => {
    if (state.roleIds.length === 0 || !state.tenantId) {
      return;
    }

    await admin.from("roles").delete().in("id", state.roleIds);
  });

  await guard("delete profile", async () => {
    if (!state.profileId) {
      return;
    }

    await admin.from("user_profiles").delete().eq("id", state.profileId);
  });

  await guard("delete tenant", async () => {
    if (!state.tenantId) {
      return;
    }

    await admin.from("tenants").delete().eq("id", state.tenantId);
  });

  await guard("delete auth user", async () => {
    if (!state.authUserId) {
      return;
    }

    await admin.auth.admin.deleteUser(state.authUserId);
  });

  extractRollbackErrors(errors);
}

export async function runTenantOnboardingFlow(
  request: TenantOnboardingRequest
): Promise<OnboardingResult> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  const { onboardClients, preflightClients, admin } = buildSupabaseClients(
    supabaseUrl,
    supabaseServiceRoleKey
  );

  const preflight = await runPreflightChecks(request, {
    tenantSlugExists: preflightClients.tenantSlugExists,
    authIdentityExistsByEmail: preflightClients.authIdentityExistsByEmail,
    localProfileExistsByEmail: preflightClients.localProfileExistsByEmail,
    capabilityKeysExist: preflightClients.capabilityKeysExist,
  });

  if (!preflight.ok) {
    throw new Error(`Preflight checks failed:\n${formatPreflightIssues(preflight.issues)}`);
  }

  const state: ProvisionedState = {
    roleIds: [],
    grantedRoleIds: [],
  };

  try {
    state.tenantId = await onboardClients.createTenant(request.tenant);
    state.authUserId = await onboardClients.createAuthUser(
      state.tenantId,
      request.admin
    );
    state.profileId = await onboardClients.createProfile(
      state.tenantId,
      state.authUserId,
      request.admin
    );

    const roleIdsByName = await onboardClients.createRoles(state.tenantId);
    state.roleIds = [...roleIdsByName.values()];
    state.grantedRoleIds = state.roleIds;

    const capabilityIdsByKey = await loadCapabilities(admin);
    await onboardClients.mapCapabilitiesToRoles(
      state.tenantId,
      roleIdsByName,
      capabilityIdsByKey
    );

    state.adminRoleId = roleIdsByName.get("administrador");
    state.adminUserRoleId = await onboardClients.assignAdminRole(
      state.tenantId,
      state.profileId
    );

    return {
      tenantId: state.tenantId,
      tenantSlug: request.tenant.slug,
      authUserId: state.authUserId,
      profileId: state.profileId,
      roleCount: state.roleIds.length,
    };
  } catch (error) {
    await rollbackOnFailure(admin, state);
    const message = normalizeErrorMessage(error);
    throw new Error(`Onboarding flow failed; resources rolled back: ${message}`);
  }
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  pnpm tenant:create-admin --payload '<json>'
  pnpm tenant:create-admin < input.json

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Payload shape:
  {
    "tenant": {
      "name": "Tenant Name",
      "slug": "tenant-name",
      "timezone": "America/Argentina/Buenos_Aires",
      "currency": "USD",
      "fuelUnit": "liters"
    },
    "admin": {
      "email": "admin@example.com",
      "temporaryPassword": "temp_password_123",
      "fullName": "Admin Name",
      "phone": "+5433112233"
    }
  }`);
    return;
  }

  const payloadResult = await resolvePayloadFromInput(args);
  if (!payloadResult.ok) {
    console.error(formatPreflightIssues(payloadResult.issues));
    process.exitCode = 1;
    return;
  }

  const requestResult = parseTenantOnboardingRequestFromJson(payloadResult.value);
  if (!requestResult.ok) {
    console.error(formatPreflightIssues(requestResult.issues));
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runTenantOnboardingFlow(requestResult.value);
    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId: result.tenantId,
          tenantSlug: result.tenantSlug,
          authUserId: result.authUserId,
          profileId: result.profileId,
          roleCount: result.roleCount,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(`TENANT_ONBOARDING_FAILED: ${normalizeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

// Only auto-run CLI when this script is executed directly (not imported as a module).
// With tsx, argv[1] points to the script being executed.
const isDirectExecution = process.argv.some((arg) =>
  arg.includes("create-tenant-with-admin")
);
if (isDirectExecution) {
  void runCli();
}
