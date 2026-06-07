/**
 * Public API del módulo de dominio de autenticación.
 *
 * Reexporta tipos estables para que Application/Infrastructure compartan el
 * mismo contrato sin depender de rutas de archivo internas.
 */

export type {
  AppAuthErrorCode,
  AppAuthFailure,
  AppAuthResult,
  AppAuthSuccess,
  AppSession,
  AuthUser,
  UserProfileStatus,
} from "./session";

export type {
  CapabilityCode,
  CapabilityOverrideEffect,
  EffectiveCapabilities,
  RoleId,
  TenantId,
  TenantUserScope,
  UserCapabilityOverride,
  UserId,
} from "./capabilities";

export type {
  AuthAdminPort,
  CreateTenantUserErrorCode,
  CreateTenantUserInput,
  CreateTenantUserOutcome,
  DeactivateTenantUserInput,
  MutateTenantUserErrorCode,
  MutateTenantUserOutcome,
  TenantUserSummary,
  UpdateTenantUserInput,
  UserManagementRepository,
} from "./user-management";
