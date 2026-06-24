/**
 * API pública del módulo Application para autenticación.
 * Expone contratos y casos de uso que Web consume sin conocer implementaciones
 * concretas de Supabase, tablas o detalles HTTP.
 */

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
  UserProfileStatus,
  AppAuthResult as LoginResult,
} from "@faena360/domain";

/**
 * Credenciales esperadas por el caso de uso de login.
 */
export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Resultado del login de aplicación (éxito o fallo tipado).
 */
export type LoginWithEmailPasswordOutcome = AppAuthResult;

/**
 * Contrato mínimo esperado desde el proveedor de identidad.
 */
export interface AuthIdentityPort {
  signInWithPassword(input: LoginInput): Promise<AuthUser>;

  /** Hook opcional para limpiar sesión local si la autorización de app falla. */
  signOut?(): Promise<void>;
}

/**
 * Datos de autorización local requeridos para construir una sesión de app.
 */
export interface AppSessionRepository {
  /** Resuelve tenant por id para validar contexto activo del dominio. */
  getTenant(input: { tenantId: string }): Promise<{
    readonly id: string;
    readonly status: string;
  }>;

  /**
   * Carga el perfil local del usuario dentro del tenant.
   * Retorna `null` cuando no existe para evitar crear sesiones huérfanas.
   */
  getUserProfile(input: { tenantId: string; authUserId: string }): Promise<{
    readonly userId: string;
    readonly email?: string | null;
    readonly status: "active" | "inactive";
    readonly tenantId: string;
  } | null>;

  /** Lista roles asignados al usuario para autorización local. */
  listUserRoles(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly string[]>;

  /**
   * Resuelve capacidades base de roles dentro del tenant.
   */
  listTenantRoleCapabilities(input: {
    tenantId: string;
    roleIds: readonly string[];
  }): Promise<readonly string[]>;

  /**
   * Verifica si alguno de los roles habilita acceso web (marca estructural).
   */
  hasWebAccessRole(input: {
    tenantId: string;
    userId: string;
    roleIds?: readonly string[];
  }): Promise<boolean>;

  /**
   * Lee overrides explícitos de capacidades para ese usuario/tenant.
   */
  listUserCapabilityOverrides(input: {
    tenantId: string;
    userId: string;
  }): Promise<readonly UserCapabilityOverride[]>;
}

/**
 * Contrato del caso de uso principal de login.
 */
export interface LoginWithEmailPasswordService {
  login(input: LoginInput): Promise<LoginWithEmailPasswordOutcome>;
}

export type {
  TenantUserManagementService,
  UserManagementServiceDependencies,
} from "./user-management";

export { LoginWithEmailPasswordServiceImpl } from "./app-session";
export { createUserManagementService } from "./user-management";

export interface UserCapabilityOverride {
  readonly capabilityCode: string;
  readonly effect: "allow" | "deny";
}

export type { AuditPort } from "./audit";
