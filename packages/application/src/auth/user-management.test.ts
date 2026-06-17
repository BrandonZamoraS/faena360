import { describe, expect, it } from "vitest";
import type {
  AuthAdminPort,
  CreateTenantUserInput,
  TenantUserSummary,
  UserManagementRepository,
} from "@faena360/domain";

import {
  createUserManagementService,
  type UserManagementServiceDependencies,
} from "./user-management";
import { CapabilityDeniedError } from "./effective-capabilities";

interface MockCalls {
  readonly requireCapability: string[];
  readonly requireCapabilityScopes: Array<{
    readonly tenantId: string;
    readonly userId: string;
  }>;
  readonly identifierExistsCalls: Array<{
    readonly email: string;
    readonly phone?: string;
  }>;
  readonly createAuthCalls: string[];
  readonly deleteAuthCalls: string[];
  readonly disableAuthCalls: string[];
  readonly createProfileCalls: Array<{
    readonly tenantId: string;
    readonly authUserId: string;
    readonly email: string;
    readonly fullName: string;
    readonly phone?: string;
  }>;
  readonly assignRoleCalls: Array<{
    readonly tenantId: string;
    readonly userId: string;
    readonly roleIds: readonly string[];
  }>;
  readonly auditCalls: Array<{
    readonly action?: string;
    readonly actorUserId: string;
    readonly targetUserId: string;
  }>;
  readonly listActiveCalls: string[];
  readonly updateProfileCalls: Array<{
    readonly tenantId: string;
    readonly userId: string;
    readonly fullName: string;
    readonly phone?: string;
  }>;
  readonly replaceRoleCalls: Array<{
    readonly tenantId: string;
    readonly userId: string;
    readonly roleIds: readonly string[];
  }>;
  readonly deactivateProfileCalls: Array<{
    readonly tenantId: string;
    readonly userId: string;
  }>;
  readonly reactivateProfileCalls: Array<{
    readonly tenantId: string;
    readonly userId: string;
  }>;
  readonly identifierExistsExcludingCalls: Array<{
    readonly userId: string;
    readonly email: string;
    readonly phone: string;
  }>;
  readonly getUserEmailCalls: Array<{
    readonly userId: string;
    readonly tenantId: string;
  }>;
  readonly invalidatorCalls: Array<{
    readonly tenantId: string;
    readonly userId: string;
  }>;
}

type UserManagementDependenciesOverrides = {
  readonly authAdmin?: Partial<AuthAdminPort>;
  readonly repository?: Partial<UserManagementRepository>;
  readonly capabilityChecker?: {
    readonly requireCapability?: UserManagementServiceDependencies["capabilityChecker"]["requireCapability"];
  };
  readonly capabilityInvalidator?: {
    readonly invalidate?: UserManagementServiceDependencies["capabilityInvalidator"] extends {
      invalidate: infer F;
    }
      ? F
      : never;
  } | null;
};

function createCallsTracker(): MockCalls {
  return {
    requireCapability: [],
    requireCapabilityScopes: [],
    identifierExistsCalls: [],
    createAuthCalls: [],
    deleteAuthCalls: [],
    disableAuthCalls: [],
    createProfileCalls: [],
    assignRoleCalls: [],
    auditCalls: [],
    listActiveCalls: [],
    updateProfileCalls: [],
    replaceRoleCalls: [],
    deactivateProfileCalls: [],
    reactivateProfileCalls: [],
    identifierExistsExcludingCalls: [],
    getUserEmailCalls: [],
    invalidatorCalls: [],
  };
}

function createUserManagementServiceWithMocks(
  overrides?: UserManagementDependenciesOverrides & {
    readonly calls?: MockCalls;
  }
) {
  const calls: MockCalls = overrides?.calls ?? createCallsTracker();

  const service = createUserManagementService({
    authAdmin: {
      createUser: async (
        _input: Parameters<AuthAdminPort["createUser"]>[0]
      ) => {
        calls.createAuthCalls.push("called");
        return {
          authUserId: "auth-user-id-1",
        };
      },
      deleteUser: async (
        authUserId: Parameters<AuthAdminPort["deleteUser"]>[0]
      ) => {
        calls.deleteAuthCalls.push(authUserId);
      },
      disableUser: async (
        authUserId: Parameters<AuthAdminPort["disableUser"]>[0]
      ) => {
        calls.disableAuthCalls.push(authUserId);
      },
      ...overrides?.authAdmin,
    },
    repository: {
      identifierExists: async ({
        email,
        phone,
      }: Parameters<UserManagementRepository["identifierExists"]>[0]) => {
        calls.identifierExistsCalls.push({
          email,
          ...(phone ? { phone } : {}),
        });

        return false;
      },
      identifierExistsExcluding: async ({
        userId,
        email,
        phone,
      }: Parameters<
        UserManagementRepository["identifierExistsExcluding"]
      >[0]) => {
        calls.identifierExistsExcludingCalls.push({ userId, email, phone });

        return false;
      },
      getUserEmail: async ({
        userId,
        tenantId,
      }: Parameters<UserManagementRepository["getUserEmail"]>[0]) => {
        calls.getUserEmailCalls.push({ userId, tenantId });
        return "target@example.com";
      },
      createProfile: async ({
        tenantId,
        authUserId,
        email,
        fullName,
        phone,
      }: Parameters<UserManagementRepository["createProfile"]>[0]) => {
        calls.createProfileCalls.push({
          tenantId,
          authUserId,
          email,
          fullName,
          ...(phone ? { phone } : {}),
        });

        return "user-id-1";
      },
      assignRoles: async ({
        tenantId,
        userId,
        roleIds,
      }: Parameters<UserManagementRepository["assignRoles"]>[0]) => {
        calls.assignRoleCalls.push({ tenantId, userId, roleIds });
      },
      listActiveUsers: async ({
        tenantId,
      }: Parameters<UserManagementRepository["listActiveUsers"]>[0]) => {
        calls.listActiveCalls.push(tenantId);

        return [
          {
            user_id: "listed-user-id",
            tenant_id: tenantId,
            email: "tenant-user@example.com",
            full_name: "Tenant user",
            phone: "+34 111 111 111",
            status: "active",
          } satisfies TenantUserSummary,
        ];
      },
      recordUserCreatedAudit: async ({
        actorUserId,
        targetUserId,
      }: Parameters<UserManagementRepository["recordUserCreatedAudit"]>[0]) => {
        calls.auditCalls.push({
          action: "user_created",
          actorUserId,
          targetUserId,
        });
      },
      updateProfile: async ({
        tenantId,
        userId,
        fullName,
        phone,
      }: Parameters<UserManagementRepository["updateProfile"]>[0]) => {
        calls.updateProfileCalls.push({
          tenantId,
          userId,
          fullName,
          ...(phone ? { phone } : {}),
        });
      },
      replaceRoles: async ({
        tenantId,
        userId,
        roleIds,
      }: Parameters<UserManagementRepository["replaceRoles"]>[0]) => {
        calls.replaceRoleCalls.push({ tenantId, userId, roleIds });
      },
      deactivateProfile: async ({
        tenantId,
        userId,
      }: Parameters<UserManagementRepository["deactivateProfile"]>[0]) => {
        calls.deactivateProfileCalls.push({ tenantId, userId });
        return { authUserId: "auth-user-id-for-deactivate" };
      },
      reactivateProfile: async ({
        tenantId,
        userId,
      }: Parameters<UserManagementRepository["reactivateProfile"]>[0]) => {
        calls.reactivateProfileCalls.push({ tenantId, userId });
      },
      recordUserUpdatedAudit: async ({
        actorUserId,
        targetUserId,
      }: Parameters<UserManagementRepository["recordUserUpdatedAudit"]>[0]) => {
        calls.auditCalls.push({
          action: "user_updated",
          actorUserId,
          targetUserId,
        });
      },
      recordUserDeactivatedAudit: async ({
        actorUserId,
        targetUserId,
      }: Parameters<
        UserManagementRepository["recordUserDeactivatedAudit"]
      >[0]) => {
        calls.auditCalls.push({
          action: "user_deactivated",
          actorUserId,
          targetUserId,
        });
      },
      ...overrides?.repository,
    },
    capabilityChecker: {
      requireCapability: async (scope, capabilityCode) => {
        calls.requireCapability.push(capabilityCode);
        calls.requireCapabilityScopes.push(scope);
        return {} as unknown as never;
      },
      ...overrides?.capabilityChecker,
    },
    capabilityInvalidator:
      overrides?.capabilityInvalidator === null
        ? undefined
        : {
            invalidate: async (scope) => {
              calls.invalidatorCalls.push(scope);
            },
            ...(overrides?.capabilityInvalidator
              ? { invalidate: overrides.capabilityInvalidator.invalidate }
              : {}),
          },
  });

  return {
    service,
    calls,
  };
}

function assert(condition: boolean, message: string): void {
  expect(condition, message).toBe(true);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  expect(actual, message).toEqual(expected);
}

async function runUserManagementServiceContractChecks(): Promise<void> {
  await runCapabilityRejectionPreventsCreation();
  await runDuplicatePreflightRejectsWithoutAuthWrite();
  await runCompensationRunsOnLocalFailureAfterAuthCreated();
  await runListUsersFiltersToActiveTenantOnly();
  await runUpdateUserRequiresUpdateCapabilityAndReplacesRoles();
  await runUpdateUserRequiresRoleCapabilityBeforeProfileMutation();
  await runDeactivateUserSoftDeletesProfileOnly();
  await runDeactivateUserCompensatesProfileWhenAuthDisableFails();
  await runCreateUserRequiresRoleUpdateCapabilityForRoleGrants();
  await runUpdateUserRejectsDuplicatePhone();
  await runUpdateUserSelfExclusionAllowsSamePhone();
  await runUpdateUserInvalidatesCapabilitiesCacheAfterReplaceRoles();
  await runUpdateUserSkipsInvalidationWhenInvalidatorUndefined();
}

async function runCapabilityRejectionPreventsCreation(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    capabilityChecker: {
      requireCapability: async (scope) => {
        calls.requireCapability.push("users:create");
        calls.requireCapabilityScopes.push(scope);
        throw new CapabilityDeniedError("actor-1", "tenant-1", "users:create");
      },
    },
  });

  const input: CreateTenantUserInput = {
    email: "Admin@Example.COM",
    temporaryPassword: "Temp123!",
    fullName: "Admin User",
    phone: "+1 (555) 123-4567",
    roleIds: ["role-1"],
  };

  const result = await service.createUser(
    {
      tenant_id: "tenant-1",
      user_id: "actor-1",
    },
    input
  );

  assert(
    result.ok === false,
    "Expected createUser to fail with capability denial."
  );
  assertEquals(
    result.code,
    "capability_denied",
    "Expected capability_denied result for rejected capability"
  );

  assertEquals(
    calls.requireCapability.length,
    1,
    "Expected one capability check call"
  );
  assertEquals(
    calls.requireCapabilityScopes[0]?.tenantId,
    "tenant-1",
    "Expected capability check to receive camelCase tenantId"
  );
  assertEquals(
    calls.requireCapabilityScopes[0]?.userId,
    "actor-1",
    "Expected capability check to receive camelCase userId"
  );
  assertEquals(
    calls.createAuthCalls.length,
    0,
    "Expected createUser to skip auth creation when capability is denied"
  );
}

async function runDuplicatePreflightRejectsWithoutAuthWrite(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    repository: {
      identifierExists: async () => {
        calls.identifierExistsCalls.push({
          email: "admin@example.com",
          phone: "15551234567",
        });

        return true;
      },
    },
  });

  const input: CreateTenantUserInput = {
    email: "  ADMIN@EXAMPLE.COM  ",
    temporaryPassword: "Temp123!",
    fullName: "Admin User",
    phone: " +1 (555) 123-4567 ",
    roleIds: ["role-1"],
  };

  const result = await service.createUser(
    {
      tenant_id: "tenant-1",
      user_id: "actor-1",
    },
    input
  );

  assert(
    result.ok === false,
    "Expected createUser to reject duplicated identifiers."
  );
  assertEquals(
    result.code,
    "duplicate_identifier",
    "Expected duplicate_identifier on preflight hit"
  );

  assertEquals(
    calls.identifierExistsCalls.length,
    1,
    "Expected one preflight duplicate check call"
  );
  assertEquals(
    calls.identifierExistsCalls[0]!.email,
    "admin@example.com",
    "Expected email normalization before preflight"
  );
  assertEquals(
    calls.identifierExistsCalls[0]!.phone,
    "15551234567",
    "Expected phone normalization before preflight"
  );
  assertEquals(
    calls.createAuthCalls.length,
    0,
    "Expected no Auth write after duplicate preflight"
  );
}

async function runCompensationRunsOnLocalFailureAfterAuthCreated(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    repository: {
      assignRoles: async () => {
        throw new Error("Role assignment failed in test.");
      },
    },
  });

  const input: CreateTenantUserInput = {
    email: "new@tenant.example",
    temporaryPassword: "Temp123!",
    fullName: "New User",
    phone: "+55 11 5555-4444",
    roleIds: ["role-1", "role-2"],
  };

  const result = await service.createUser(
    {
      tenant_id: "tenant-2",
      user_id: "actor-2",
    },
    input
  );

  assert(
    result.ok === false,
    "Expected failure path to return a failed outcome."
  );
  assertEquals(
    result.code,
    "role_assignment_failed",
    "Expected role assignment failure to map to role_assignment_failed"
  );
  assertEquals(
    calls.createAuthCalls.length,
    1,
    "Expected one Auth create call before local failure"
  );
  assertEquals(
    calls.deleteAuthCalls.length,
    1,
    "Expected Auth compensation call after local failure"
  );
  assertEquals(
    calls.deleteAuthCalls[0],
    "auth-user-id-1",
    "Expected compensation to target created Auth user"
  );
}

async function runListUsersFiltersToActiveTenantOnly(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
  });

  const result = await service.listUsers({
    tenant_id: "  tenant-3  ",
    user_id: "actor-3",
  });

  assertEquals(
    calls.requireCapability.length,
    1,
    "Expected one capability check for listUsers"
  );
  assertEquals(
    calls.requireCapability[0],
    "users:read",
    "Expected users:read capability check"
  );
  assertEquals(
    calls.listActiveCalls[0],
    "tenant-3",
    "Expected tenant id trimming before repository call"
  );

  assertEquals(
    result.length,
    1,
    "Expected one user result in listUsers default"
  );
  assertEquals(
    result[0]?.tenant_id,
    "tenant-3",
    "Expected active listing scoped to requesting tenant"
  );
  assertEquals(
    result[0]?.status,
    "active",
    "Expected repository result to remain active in service defaults"
  );
}

async function runUpdateUserRequiresUpdateCapabilityAndReplacesRoles(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({ calls });

  const result = await service.updateUser(
    {
      tenant_id: " tenant-4 ",
      user_id: "actor-4",
    },
    {
      userId: "target-user-4",
      fullName: "  Updated User  ",
      phone: " +1 (555) 222-3333 ",
      roleIds: ["role-a", "role-b", "role-a"],
    }
  );

  assert(result.ok === true, "Expected updateUser to succeed by default.");
  assertEquals(
    calls.requireCapability[0],
    "users:update",
    "Expected users:update capability check"
  );
  assertEquals(
    calls.updateProfileCalls[0],
    {
      tenantId: "tenant-4",
      userId: "target-user-4",
      fullName: "Updated User",
      phone: "15552223333",
    },
    "Expected normalized profile update payload"
  );
  assertEquals(
    calls.requireCapability,
    ["users:update", "roles:update"],
    "Expected role grants during update to require roles:update"
  );
  assertEquals(
    calls.replaceRoleCalls[0],
    {
      tenantId: "tenant-4",
      userId: "target-user-4",
      roleIds: ["role-a", "role-b"],
    },
    "Expected role replacement with deduplicated role ids"
  );
  assertEquals(
    calls.auditCalls.at(-1),
    {
      action: "user_updated",
      actorUserId: "actor-4",
      targetUserId: "target-user-4",
    },
    "Expected update audit event"
  );
}

async function runCreateUserRequiresRoleUpdateCapabilityForRoleGrants(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    capabilityChecker: {
      requireCapability: async (scope, capabilityCode) => {
        calls.requireCapability.push(capabilityCode);
        calls.requireCapabilityScopes.push(scope);
        if (capabilityCode === "roles:update") {
          throw new CapabilityDeniedError(
            scope.userId,
            scope.tenantId,
            capabilityCode
          );
        }
      },
    },
  });

  const result = await service.createUser(
    { tenant_id: "tenant-6", user_id: "actor-6" },
    {
      email: "new-user@example.com",
      temporaryPassword: "Temp123!",
      fullName: "New User",
      roleIds: ["admin-role-id"],
    }
  );

  assert(
    result.ok === false,
    "Expected createUser to reject unsafe role grants."
  );
  assertEquals(
    result.code,
    "capability_denied",
    "Expected capability denial when actor cannot update roles"
  );
  assertEquals(
    calls.createAuthCalls.length,
    0,
    "Expected no Auth user creation when role grant capability is denied"
  );
}

async function runUpdateUserRequiresRoleCapabilityBeforeProfileMutation(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    capabilityChecker: {
      requireCapability: async (scope, capabilityCode) => {
        calls.requireCapability.push(capabilityCode);
        calls.requireCapabilityScopes.push(scope);
        if (capabilityCode === "roles:update") {
          throw new CapabilityDeniedError(
            scope.userId,
            scope.tenantId,
            capabilityCode
          );
        }
      },
    },
  });

  const result = await service.updateUser(
    { tenant_id: "tenant-7", user_id: "actor-7" },
    {
      userId: "target-user-7",
      fullName: "Partial Mutation Risk",
      roleIds: ["admin-role-id"],
    }
  );

  assert(
    result.ok === false,
    "Expected updateUser to reject unsafe role edits."
  );
  assertEquals(
    result.code,
    "capability_denied",
    "Expected capability denial when actor cannot update roles"
  );
  assertEquals(
    calls.updateProfileCalls.length,
    0,
    "Expected no profile mutation before role capability is confirmed"
  );
  assertEquals(
    calls.replaceRoleCalls.length,
    0,
    "Expected no role replacement after role capability is denied"
  );
}

async function runDeactivateUserSoftDeletesProfileOnly(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({ calls });

  const result = await service.deactivateUser(
    {
      tenant_id: "tenant-5",
      user_id: "actor-5",
    },
    {
      userId: "target-user-5",
    }
  );

  assert(result.ok === true, "Expected deactivateUser to succeed by default.");
  assertEquals(
    calls.requireCapability[0],
    "users:update",
    "Expected users:update capability check for soft delete"
  );
  assertEquals(
    calls.deactivateProfileCalls[0],
    {
      tenantId: "tenant-5",
      userId: "target-user-5",
    },
    "Expected soft delete to deactivate the local profile"
  );
  assertEquals(
    calls.deleteAuthCalls.length,
    0,
    "Expected soft delete not to hard-delete Auth identity"
  );
  assertEquals(
    calls.disableAuthCalls[0],
    "auth-user-id-for-deactivate",
    "Expected soft delete to revoke Auth access for the deactivated user"
  );
  assertEquals(
    calls.auditCalls.at(-1),
    {
      action: "user_deactivated",
      actorUserId: "actor-5",
      targetUserId: "target-user-5",
    },
    "Expected soft delete audit event"
  );
}

async function runDeactivateUserCompensatesProfileWhenAuthDisableFails(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    authAdmin: {
      disableUser: async (authUserId) => {
        calls.disableAuthCalls.push(authUserId);
        throw new Error("Auth disable failed in test.");
      },
    },
  });

  const result = await service.deactivateUser(
    {
      tenant_id: "tenant-8",
      user_id: "actor-8",
    },
    {
      userId: "target-user-8",
    }
  );

  assert(
    result.ok === false,
    "Expected deactivateUser to fail when Auth disable fails."
  );
  assertEquals(
    result.code,
    "profile_update_failed",
    "Expected failed deactivation outcome when Auth disable cannot complete"
  );
  assertEquals(
    calls.reactivateProfileCalls[0],
    {
      tenantId: "tenant-8",
      userId: "target-user-8",
    },
    "Expected local profile reactivation compensation after Auth disable failure"
  );
  assertEquals(
    calls.auditCalls.length,
    0,
    "Expected no deactivation audit when deactivation is compensated"
  );
}

async function runUpdateUserRejectsDuplicatePhone(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    repository: {
      identifierExistsExcluding: async ({ userId, email, phone }) => {
        calls.identifierExistsExcludingCalls.push({ userId, email, phone });
        return true;
      },
    },
  });

  const result = await service.updateUser(
    { tenant_id: "tenant-9", user_id: "actor-9" },
    {
      userId: "target-user-9",
      fullName: "Updated User",
      phone: "15559998888",
    }
  );

  assert(result.ok === false, "Expected updateUser to reject duplicate phone.");
  assertEquals(
    result.code,
    "duplicate_identifier",
    "Expected duplicate_identifier when phone is already taken"
  );
  assertEquals(
    calls.identifierExistsExcludingCalls.length,
    1,
    "Expected one identifierExistsExcluding call for phone uniqueness"
  );
  assertEquals(
    calls.identifierExistsExcludingCalls[0],
    { userId: "target-user-9", email: "target@example.com", phone: "15559998888" },
    "Expected self-exclusion check with correct userId, email, and normalized phone"
  );
  assertEquals(
    calls.updateProfileCalls.length,
    0,
    "Expected no profile update when phone is duplicate"
  );
}

async function runUpdateUserSelfExclusionAllowsSamePhone(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({ calls });

  const result = await service.updateUser(
    { tenant_id: "tenant-10", user_id: "actor-10" },
    {
      userId: "target-user-10",
      fullName: "Same Phone User",
      phone: "15550001111",
    }
  );

  assert(
    result.ok === true,
    "Expected updateUser to succeed when phone is not duplicate (self-exclusion default mock returns false)."
  );
  assertEquals(
    calls.identifierExistsExcludingCalls[0],
    { userId: "target-user-10", email: "target@example.com", phone: "15550001111" },
    "Expected self-exclusion check with own userId to pass"
  );
  assertEquals(
    calls.updateProfileCalls.length,
    1,
    "Expected profile update after successful phone uniqueness check"
  );
}

async function runUpdateUserInvalidatesCapabilitiesCacheAfterReplaceRoles(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
  });

  const result = await service.updateUser(
    { tenant_id: "tenant-11", user_id: "actor-11" },
    {
      userId: "target-user-11",
      fullName: "Role Change User",
      roleIds: ["role-x"],
    }
  );

  assert(
    result.ok === true,
    "Expected updateUser to succeed with role replacement and invalidation."
  );
  assertEquals(
    calls.replaceRoleCalls.length,
    1,
    "Expected one replaceRoles call"
  );
  assertEquals(
    calls.invalidatorCalls.length,
    1,
    "Expected one capabilityInvalidator.invalidate call after replaceRoles"
  );
  assertEquals(
    calls.invalidatorCalls[0],
    { tenantId: "tenant-11", userId: "target-user-11" },
    "Expected invalidation scope to match target user and tenant"
  );
}

async function runUpdateUserSkipsInvalidationWhenInvalidatorUndefined(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    capabilityInvalidator: null,
  });

  const result = await service.updateUser(
    { tenant_id: "tenant-12", user_id: "actor-12" },
    {
      userId: "target-user-12",
      fullName: "No Invalidator User",
      roleIds: ["role-y"],
    }
  );

  assert(
    result.ok === true,
    "Expected updateUser to succeed when capabilityInvalidator is undefined"
  );
  assertEquals(
    calls.replaceRoleCalls.length,
    1,
    "Expected replaceRoles to still be called"
  );
  assertEquals(
    calls.invalidatorCalls.length,
    0,
    "Expected no invalidator call when capabilityInvalidator is not provided"
  );
}

describe("user management service", () => {
  it("prevents creating a user when capability is denied", async () => {
    await runCapabilityRejectionPreventsCreation();
  });

  it("prevents creating duplicate identifiers before writing auth", async () => {
    await runDuplicatePreflightRejectsWithoutAuthWrite();
  });

  it("compensates auth creation when repository write fails", async () => {
    await runCompensationRunsOnLocalFailureAfterAuthCreated();
  });

  it("returns only active users scoped to the requesting tenant", async () => {
    await runListUsersFiltersToActiveTenantOnly();
  });

  it("updates a user only with update capability and replaces roles", async () => {
    await runUpdateUserRequiresUpdateCapabilityAndReplacesRoles();
  });

  it("checks role edit capability before mutating profile fields", async () => {
    await runUpdateUserRequiresRoleCapabilityBeforeProfileMutation();
  });

  it("soft deletes users by deactivating local profiles", async () => {
    await runDeactivateUserSoftDeletesProfileOnly();
  });

  it("reactivates the local profile when auth disable fails", async () => {
    await runDeactivateUserCompensatesProfileWhenAuthDisableFails();
  });

  it("requires role update capability before granting roles on create", async () => {
    await runCreateUserRequiresRoleUpdateCapabilityForRoleGrants();
  });

  it("rejects update with duplicate phone via identifierExistsExcluding", async () => {
    await runUpdateUserRejectsDuplicatePhone();
  });

  it("allows update with same phone via self-exclusion", async () => {
    await runUpdateUserSelfExclusionAllowsSamePhone();
  });

  it("invalidates capabilities cache after successful replaceRoles", async () => {
    await runUpdateUserInvalidatesCapabilitiesCacheAfterReplaceRoles();
  });

  it("skips invalidation when capabilityInvalidator is undefined", async () => {
    await runUpdateUserSkipsInvalidationWhenInvalidatorUndefined();
  });

  it("runs user management contract checks", async () => {
    await runUserManagementServiceContractChecks();
  });
});
