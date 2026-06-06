export interface CreateTenantUserInput {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly roleIds: readonly string[];
}

export interface TenantUserSummary {
  readonly user_id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly phone: string | null;
  readonly status: "active" | "inactive";
}

export type CreateTenantUserErrorCode =
  | "missing_tenant"
  | "duplicate_identifier"
  | "capability_denied"
  | "auth_create_failed"
  | "profile_create_failed"
  | "role_assignment_failed"
  | "audit_failed"
  | "compensation_failed";

export interface AuthAdminPort {
  createUser(input: {
    readonly email: string;
    readonly temporaryPassword: string;
    readonly app_metadata: {
      readonly tenant_id: string;
    };
  }): Promise<{ readonly authUserId: string }>;

  deleteUser(authUserId: string): Promise<void>;
}

export interface UserManagementRepository {
  identifierExists(input: {
    readonly email: string;
    readonly phone?: string;
  }): Promise<boolean>;

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

  listActiveUsers(input: {
    readonly tenantId: string;
  }): Promise<readonly TenantUserSummary[]>;

  recordUserCreatedAudit(input: {
    readonly actorUserId: string;
    readonly targetUserId: string;
  }): Promise<void>;
}

export interface CreateTenantUserOutcome {
  readonly ok: boolean;
  readonly authUserId?: string;
  readonly userId?: string;
  readonly user?: TenantUserSummary;
  readonly code?: CreateTenantUserErrorCode;
}
