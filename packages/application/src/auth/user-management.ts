import type {
  AuthAdminPort,
  CreateTenantUserErrorCode,
  CreateTenantUserInput,
  CreateTenantUserOutcome,
  TenantUserSummary,
  UserManagementRepository,
} from "@faena360/domain";

import { CapabilityDeniedError } from "./effective-capabilities";

interface TenantSessionScope {
  readonly tenant_id: string;
  readonly user_id: string;
}

export interface UserManagementServiceDependencies {
  readonly authAdmin: AuthAdminPort;
  readonly repository: UserManagementRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: TenantSessionScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

const USERS_CREATE_CAPABILITY = "users:create" as const;
const USERS_READ_CAPABILITY = "users:read" as const;

export interface TenantUserManagementService {
  createUser(
    session: TenantSessionScope,
    input: CreateTenantUserInput
  ): Promise<CreateTenantUserOutcome>;

  listUsers(session: TenantSessionScope): Promise<readonly TenantUserSummary[]>;
}

interface NormalizedCreateTenantUserInput {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly roleIds: readonly string[];
}

export function createUserManagementService(
  dependencies: UserManagementServiceDependencies
): TenantUserManagementService {
  const { authAdmin, repository, capabilityChecker } = dependencies;

  return {
    async createUser(session, input): Promise<CreateTenantUserOutcome> {
      const tenantId = resolveTenantId(session.tenant_id);

      if (!tenantId) {
        return {
          ok: false,
          code: "missing_tenant",
        };
      }

      if (containsTenantOverride(input)) {
        return {
          ok: false,
          code: "capability_denied",
        };
      }

      try {
        await capabilityChecker.requireCapability(
          {
            ...session,
            tenant_id: tenantId,
          },
          USERS_CREATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return {
            ok: false,
            code: "capability_denied",
          };
        }

        throw error;
      }

      const normalizedInput = normalizeCreateUserInput(input);

      const identifierExists = await repository.identifierExists({
        email: normalizedInput.email,
        ...(normalizedInput.phone ? { phone: normalizedInput.phone } : {}),
      });

      if (identifierExists) {
        return {
          ok: false,
          code: "duplicate_identifier",
        };
      }

      let authUserId: string | undefined;
      let userId: string | undefined;
      let localFailureCode: CreateTenantUserErrorCode = "profile_create_failed";

      try {
        const createdAuthUser = await authAdmin.createUser({
          email: normalizedInput.email,
          temporaryPassword: normalizedInput.temporaryPassword,
          app_metadata: {
            tenant_id: tenantId,
          },
        });

        authUserId = createdAuthUser.authUserId;

        localFailureCode = "profile_create_failed";
        userId = await repository.createProfile({
          tenantId,
          authUserId,
          email: normalizedInput.email,
          fullName: normalizedInput.fullName,
          ...(normalizedInput.phone ? { phone: normalizedInput.phone } : {}),
        });

        localFailureCode = "role_assignment_failed";
        await repository.assignRoles({
          tenantId,
          userId,
          roleIds: normalizedInput.roleIds,
        });

        localFailureCode = "audit_failed";
        await repository.recordUserCreatedAudit({
          actorUserId: session.user_id,
          targetUserId: userId,
        });

        return {
          ok: true,
          authUserId,
          userId,
        };
      } catch (error) {
        if (!authUserId) {
          return {
            ok: false,
            code: "auth_create_failed",
          };
        }

        const didCompensate = await compensateAuthCreation(
          authAdmin,
          authUserId
        );

        return {
          ok: false,
          authUserId,
          userId,
          code: didCompensate ? localFailureCode : "compensation_failed",
        };
      }
    },

    async listUsers(session): Promise<readonly TenantUserSummary[]> {
      const tenantId = resolveTenantId(session.tenant_id);

      if (!tenantId) {
        throw new Error("Cannot list users without tenant context.");
      }

      await capabilityChecker.requireCapability(
        {
          ...session,
          tenant_id: tenantId,
        },
        USERS_READ_CAPABILITY
      );

      return repository.listActiveUsers({
        tenantId,
      });
    },
  };
}

function resolveTenantId(tenantId?: string | null): string {
  if (!tenantId) {
    return "";
  }

  return tenantId.trim();
}

function containsTenantOverride(input: CreateTenantUserInput): boolean {
  const candidate = input as unknown as Record<string, unknown>;

  return (
    Object.prototype.hasOwnProperty.call(candidate, "tenant_id") ||
    Object.prototype.hasOwnProperty.call(candidate, "tenantId") ||
    Object.prototype.hasOwnProperty.call(candidate, "tenant")
  );
}

function normalizeCreateUserInput(
  input: CreateTenantUserInput
): NormalizedCreateTenantUserInput {
  return {
    email: input.email.trim().toLowerCase(),
    temporaryPassword: input.temporaryPassword,
    fullName: input.fullName.trim(),
    phone: normalizePhone(input.phone),
    roleIds: input.roleIds,
  };
}

function normalizePhone(phone?: string): string | undefined {
  if (!phone) {
    return undefined;
  }

  const normalized = phone.replace(/\D/g, "");

  return normalized.length > 0 ? normalized : undefined;
}

async function compensateAuthCreation(
  authAdmin: AuthAdminPort,
  authUserId: string
): Promise<boolean> {
  try {
    await authAdmin.deleteUser(authUserId);
    return true;
  } catch {
    return false;
  }
}
