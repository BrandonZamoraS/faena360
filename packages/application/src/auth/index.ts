export {
  applyCapabilityOverrides,
  CapabilityDeniedError,
  createEffectiveCapabilitiesCacheKey,
  createEffectiveCapabilitiesResolver,
  InMemoryEffectiveCapabilitiesCache,
} from "./effective-capabilities";

export type {
  EffectiveCapabilitiesCache,
  EffectiveCapabilitiesRepository,
  EffectiveCapabilitiesResolverOptions,
} from "./effective-capabilities";
import type {
  AppAuthErrorCode,
  AppAuthFailure,
  AppAuthResult,
  AppAuthSuccess,
  AppSession,
  AuthUser,
} from "@faena360/domain";

export type {
  AppAuthErrorCode,
  AppAuthFailure,
  AppAuthResult,
  AppAuthSuccess,
  AppSession,
  AuthUser,
} from "@faena360/domain";

/**
 * Input accepted by app-session login flow.
 */
export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Effective result of app-session login.
 */
export type LoginWithEmailPasswordOutcome = AppAuthResult;

/**
 * Input credential identity provider contract.
 */
export interface AuthIdentityPort {
  signInWithPassword(input: LoginInput): Promise<AuthUser>;
}

/**
 * Local authorization data required to build a session.
 */
export interface AppSessionRepository {
  /** Resolves a tenant row by identifier. */
  getTenant(input: { tenantId: string }): Promise<{
    readonly id: string;
    readonly status: string;
  }>;

  /**
   * Loads a local user profile for a tenant-scoped user.
   * Returns `null` when profile does not exist.
   */
  getUserProfile(input: { tenantId: string; authUserId: string }): Promise<{
    readonly userId: string;
    readonly email: string;
    readonly status: "active" | "inactive";
    readonly tenantId: string;
  } | null>;

  /** Lists role IDs assigned to the local user for authorization. */
  listUserRoles(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly string[]>;

  /**
   * Resolves capability codes for all tenant role identifiers.
   */
  listTenantRoleCapabilities(input: {
    tenantId: string;
    roleIds: readonly string[];
  }): Promise<readonly string[]>;

  /**
   * Checks whether any assigned tenant role grants web access.
   */
  hasWebAccessRole(input: {
    tenantId: string;
    userId: string;
    roleIds?: readonly string[];
  }): Promise<boolean>;

  /**
   * Reads explicit capability overrides for the tenant user.
   */
  listUserCapabilityOverrides(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly UserCapabilityOverride[]>;
}

/**
 * Contract for the app-session application service.
 */
export interface LoginWithEmailPasswordService {
  login(input: LoginInput): Promise<LoginWithEmailPasswordOutcome>;
}

export { LoginWithEmailPasswordServiceImpl } from "./app-session";

export interface UserCapabilityOverride {
  readonly capabilityCode: string;
  readonly effect: "allow" | "deny";
}
