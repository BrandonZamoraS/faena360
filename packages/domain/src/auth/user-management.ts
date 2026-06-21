/**
 * DTO de entrada para crear usuarios de un tenant.
 */
export interface CreateTenantUserInput {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly roleIds: readonly string[];
}

export interface UpdateTenantUserInput {
  readonly userId: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly roleIds?: readonly string[];
}

export interface DeactivateTenantUserInput {
  readonly userId: string;
}

/**
 * Resumen de usuario retornado en listados administrados por tenant.
 */
export interface TenantUserSummary {
  readonly user_id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly phone: string | null;
  readonly status: "active" | "inactive";
  readonly role_ids: readonly string[];
}

/**
 * Errores de aplicación para crear usuario; cada código representa una rama
 * de recuperación/conversión esperable en Application.
 */
export type CreateTenantUserErrorCode =
  | "missing_tenant"
  | "duplicate_identifier"
  | "capability_denied"
  | "auth_create_failed"
  | "profile_create_failed"
  | "role_assignment_failed"
  | "audit_failed"
  | "compensation_failed";

export type MutateTenantUserErrorCode =
  | "missing_tenant"
  | "missing_user"
  | "capability_denied"
  | "duplicate_identifier"
  | "profile_update_failed"
  | "role_assignment_failed"
  | "audit_failed";

/**
 * Puerto de administración del proveedor de identidad (operaciones irreversibles
 * en Auth) que debe implementar Infraestructure.
 */
export interface AuthAdminPort {
  createUser(input: {
    readonly email: string;
    readonly temporaryPassword: string;
    readonly app_metadata: {
      readonly tenant_id: string;
    };
  }): Promise<{ readonly authUserId: string }>;

  deleteUser(authUserId: string): Promise<void>;

  disableUser(authUserId: string): Promise<void>;
}

/**
 * Puerto de persistencia local para perfiles/roles de usuario.
 */
export interface UserManagementRepository {
  identifierExists(input: {
    readonly email: string;
    readonly phone?: string;
  }): Promise<boolean>;

  identifierExistsExcluding(input: {
    readonly userId: string;
    readonly email: string;
    readonly phone: string;
  }): Promise<boolean>;

  getUserEmail(input: {
    readonly userId: string;
    readonly tenantId: string;
  }): Promise<string>;

  createProfile(input: {
    readonly tenantId: string;
    readonly authUserId: string;
    readonly email: string;
    readonly fullName: string;
    readonly phone?: string;
  }): Promise<string>;

  assignRoles(input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly roleIds: readonly string[];
  }): Promise<void>;

  replaceRoles(input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly roleIds: readonly string[];
  }): Promise<void>;

  updateProfile(input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly fullName: string;
    readonly phone?: string;
  }): Promise<void>;

  deactivateProfile(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<{ readonly authUserId: string }>;

  reactivateProfile(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<void>;

  listActiveUsers(input: {
    readonly tenantId: string;
  }): Promise<readonly TenantUserSummary[]>;

  recordUserCreatedAudit(input: {
    readonly actorUserId: string;
    readonly targetUserId: string;
  }): Promise<void>;

  recordUserUpdatedAudit(input: {
    readonly actorUserId: string;
    readonly targetUserId: string;
  }): Promise<void>;

  recordUserDeactivatedAudit(input: {
    readonly actorUserId: string;
    readonly targetUserId: string;
  }): Promise<void>;
}

/**
 * Resultado canónico del caso de uso de alta de usuario.
 */
export interface CreateTenantUserOutcome {
  readonly ok: boolean;
  readonly authUserId?: string;
  readonly userId?: string;
  readonly user?: TenantUserSummary;
  readonly code?: CreateTenantUserErrorCode;
}

export interface MutateTenantUserOutcome {
  readonly ok: boolean;
  readonly code?: MutateTenantUserErrorCode;
}
