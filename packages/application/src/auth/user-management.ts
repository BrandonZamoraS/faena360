import type {
  AuthAdminPort,
  CreateTenantUserErrorCode,
  CreateTenantUserInput,
  CreateTenantUserOutcome,
  DeactivateTenantUserInput,
  MutateTenantUserOutcome,
  TenantUserSummary,
  UpdateTenantUserInput,
  UserManagementRepository,
} from "@faena360/domain";

import { CapabilityDeniedError } from "./effective-capabilities";

/**
 * Flujo de aplicación para administración de usuarios dentro de un tenant.
 *
 * Orquesta proveedores (auth admin + repositorios + chequeo de capacidades)
 * y deja la consistencia de datos de dominio en manos de los repositorios.
 */

interface TenantSessionScope {
  readonly tenant_id: string;
  readonly user_id: string;
}

interface CapabilityScope {
  readonly tenantId: string;
  readonly userId: string;
}

export interface UserManagementServiceDependencies {
  readonly authAdmin: AuthAdminPort;
  readonly repository: UserManagementRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

const USERS_CREATE_CAPABILITY = "users:create" as const;
const USERS_READ_CAPABILITY = "users:read" as const;
const USERS_UPDATE_CAPABILITY = "users:update" as const;
const ROLES_UPDATE_CAPABILITY = "roles:update" as const;

export interface TenantUserManagementService {
  createUser(
    session: TenantSessionScope,
    input: CreateTenantUserInput
  ): Promise<CreateTenantUserOutcome>;

  listUsers(session: TenantSessionScope): Promise<readonly TenantUserSummary[]>;

  updateUser(
    session: TenantSessionScope,
    input: UpdateTenantUserInput
  ): Promise<MutateTenantUserOutcome>;

  deactivateUser(
    session: TenantSessionScope,
    input: DeactivateTenantUserInput
  ): Promise<MutateTenantUserOutcome>;
}

interface NormalizedCreateTenantUserInput {
  readonly email: string;
  readonly temporaryPassword: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly roleIds: readonly string[];
}

interface NormalizedUpdateTenantUserInput {
  readonly userId: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly roleIds?: readonly string[];
}

export function createUserManagementService(
  dependencies: UserManagementServiceDependencies
): TenantUserManagementService {
  const { authAdmin, repository, capabilityChecker } = dependencies;

  // Cierra el ciclo de permisos antes de tocar cualquier persistencia:
  // si el actor no puede crear usuarios, todo el flujo se rechaza temprano.

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
            tenantId,
            userId: session.user_id,
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

      if (input.roleIds.length > 0) {
        try {
          await requireActorCapability(
            capabilityChecker,
            session,
            tenantId,
            ROLES_UPDATE_CAPABILITY
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
          tenantId,
          userId: session.user_id,
        },
        USERS_READ_CAPABILITY
      );

      return repository.listActiveUsers({
        tenantId,
      });
    },

    async updateUser(session, input): Promise<MutateTenantUserOutcome> {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }

      const normalizedInput = normalizeUpdateUserInput(input);
      if (!normalizedInput.userId) {
        return { ok: false, code: "missing_user" };
      }

      try {
        await requireActorCapability(
          capabilityChecker,
          session,
          tenantId,
          USERS_UPDATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return { ok: false, code: "capability_denied" };
        }
        throw error;
      }

      if (normalizedInput.roleIds) {
        try {
          await requireActorCapability(
            capabilityChecker,
            session,
            tenantId,
            ROLES_UPDATE_CAPABILITY
          );
        } catch (error) {
          if (error instanceof CapabilityDeniedError) {
            return { ok: false, code: "capability_denied" };
          }
          throw error;
        }
      }

      try {
        await repository.updateProfile({
          tenantId,
          userId: normalizedInput.userId,
          fullName: normalizedInput.fullName,
          ...(normalizedInput.phone ? { phone: normalizedInput.phone } : {}),
        });
      } catch {
        return { ok: false, code: "profile_update_failed" };
      }

      if (normalizedInput.roleIds) {
        try {
          await repository.replaceRoles({
            tenantId,
            userId: normalizedInput.userId,
            roleIds: normalizedInput.roleIds,
          });
        } catch {
          return { ok: false, code: "role_assignment_failed" };
        }
      }

      try {
        await repository.recordUserUpdatedAudit({
          actorUserId: session.user_id,
          targetUserId: normalizedInput.userId,
        });
      } catch {
        return { ok: false, code: "audit_failed" };
      }

      return { ok: true };
    },

    async deactivateUser(session, input): Promise<MutateTenantUserOutcome> {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }

      const userId = input.userId.trim();
      if (!userId) {
        return { ok: false, code: "missing_user" };
      }

      try {
        await requireActorCapability(
          capabilityChecker,
          session,
          tenantId,
          USERS_UPDATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return { ok: false, code: "capability_denied" };
        }
        throw error;
      }

      let authUserId: string;
      try {
        const deactivatedProfile = await repository.deactivateProfile({
          tenantId,
          userId,
        });
        authUserId = deactivatedProfile.authUserId;
      } catch {
        return { ok: false, code: "profile_update_failed" };
      }

      try {
        await authAdmin.disableUser(authUserId);
      } catch {
        await repository.reactivateProfile({ tenantId, userId });
        return { ok: false, code: "profile_update_failed" };
      }

      try {
        await repository.recordUserDeactivatedAudit({
          actorUserId: session.user_id,
          targetUserId: userId,
        });
      } catch {
        return { ok: false, code: "audit_failed" };
      }

      return { ok: true };
    },
  };
}

async function requireActorCapability(
  capabilityChecker: UserManagementServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<void> {
  await capabilityChecker.requireCapability(
    {
      tenantId,
      userId: session.user_id,
    },
    capabilityCode
  );
}

function resolveTenantId(tenantId?: string | null): string {
  // Normaliza entrada de tenant para evitar que espacios en blanco rompan
  // validaciones de permisos downstream.
  if (!tenantId) {
    return "";
  }

  return tenantId.trim();
}

function containsTenantOverride(input: CreateTenantUserInput): boolean {
  // Protege contra intentos de sobre-escribir tenant con payloads fuera de
  // contrato (multi-tenant spoofing desde body del cliente).
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
  // Asegura datos consistentes para validaciones y búsquedas de unicidad.
  return {
    email: input.email.trim().toLowerCase(),
    temporaryPassword: input.temporaryPassword,
    fullName: input.fullName.trim(),
    phone: normalizePhone(input.phone),
    roleIds: input.roleIds,
  };
}

function normalizeUpdateUserInput(
  input: UpdateTenantUserInput
): NormalizedUpdateTenantUserInput {
  return {
    userId: input.userId.trim(),
    fullName: input.fullName.trim(),
    phone: normalizePhone(input.phone),
    roleIds: input.roleIds ? Array.from(new Set(input.roleIds)) : undefined,
  };
}

function normalizePhone(phone?: string): string | undefined {
  // Limpia formato libre de usuario; si queda vacío, no persiste phone.
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
  // Compensación final para mantener consistencia entre Auth y perfil local.
  try {
    await authAdmin.deleteUser(authUserId);
    return true;
  } catch {
    return false;
  }
}
