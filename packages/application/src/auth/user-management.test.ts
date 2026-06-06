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
  readonly identifierExistsCalls: Array<{
    readonly email: string;
    readonly phone?: string;
  }>;
  readonly createAuthCalls: string[];
  readonly deleteAuthCalls: string[];
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
    readonly actorUserId: string;
    readonly targetUserId: string;
  }>;
  readonly listActiveCalls: string[];
}

type UserManagementDependenciesOverrides = {
  readonly authAdmin?: Partial<AuthAdminPort>;
  readonly repository?: Partial<UserManagementRepository>;
  readonly capabilityChecker?: {
    readonly requireCapability?: UserManagementServiceDependencies["capabilityChecker"]["requireCapability"];
  };
};

function createCallsTracker(): MockCalls {
  return {
    requireCapability: [],
    identifierExistsCalls: [],
    createAuthCalls: [],
    deleteAuthCalls: [],
    createProfileCalls: [],
    assignRoleCalls: [],
    auditCalls: [],
    listActiveCalls: [],
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
        calls.auditCalls.push({ actorUserId, targetUserId });
      },
      ...overrides?.repository,
    },
    capabilityChecker: {
      requireCapability: async (_scope, capabilityCode) => {
        calls.requireCapability.push(capabilityCode);
        return {} as unknown as never;
      },
      ...overrides?.capabilityChecker,
    },
  });

  return {
    service,
    calls,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} (got ${String(actual)} expected ${String(expected)})`
    );
  }
}

export async function runUserManagementServiceContractChecks(): Promise<void> {
  await runCapabilityRejectionPreventsCreation();
  await runDuplicatePreflightRejectsWithoutAuthWrite();
  await runCompensationRunsOnLocalFailureAfterAuthCreated();
  await runListUsersFiltersToActiveTenantOnly();
}

async function runCapabilityRejectionPreventsCreation(): Promise<void> {
  const calls = createCallsTracker();

  const { service } = createUserManagementServiceWithMocks({
    calls,
    capabilityChecker: {
      requireCapability: async () => {
        calls.requireCapability.push("users:create");
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
