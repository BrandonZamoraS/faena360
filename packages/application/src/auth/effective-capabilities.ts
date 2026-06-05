import type {
  CapabilityCode,
  EffectiveCapabilities,
  RoleId,
  TenantId,
  TenantUserScope,
  UserCapabilityOverride,
  UserId,
} from "@faena360/domain";

export interface EffectiveCapabilitiesRepository {
  listUserRoleIds(scope: TenantUserScope): Promise<readonly RoleId[]>;
  listCapabilitiesForRoles(input: {
    readonly tenantId: TenantId;
    readonly roleIds: readonly RoleId[];
  }): Promise<readonly CapabilityCode[]>;
  listUserCapabilityOverrides(
    scope: TenantUserScope
  ): Promise<readonly UserCapabilityOverride[]>;
}

export interface EffectiveCapabilitiesCache {
  get(scope: TenantUserScope): Promise<ReadonlySet<CapabilityCode> | undefined>;
  set(
    scope: TenantUserScope,
    capabilities: ReadonlySet<CapabilityCode>
  ): Promise<void>;
  invalidate(scope: TenantUserScope): Promise<void>;
}

export interface EffectiveCapabilitiesResolverOptions {
  readonly repository: EffectiveCapabilitiesRepository;
  readonly cache?: EffectiveCapabilitiesCache;
}

export class CapabilityDeniedError extends Error {
  readonly code = "capability_denied";

  constructor(
    readonly userId: UserId,
    readonly tenantId: TenantId,
    readonly capabilityCode: CapabilityCode
  ) {
    super(`Capability denied: ${capabilityCode}`);
    this.name = "CapabilityDeniedError";
  }
}

export class InMemoryEffectiveCapabilitiesCache implements EffectiveCapabilitiesCache {
  private readonly entries = new Map<
    string,
    {
      readonly expiresAt: number;
      readonly capabilities: ReadonlySet<CapabilityCode>;
    }
  >();

  constructor(private readonly ttlMs = 30_000) {}

  async get(
    scope: TenantUserScope
  ): Promise<ReadonlySet<CapabilityCode> | undefined> {
    const key = createEffectiveCapabilitiesCacheKey(scope);
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return new Set(entry.capabilities);
  }

  async set(
    scope: TenantUserScope,
    capabilities: ReadonlySet<CapabilityCode>
  ): Promise<void> {
    this.entries.set(createEffectiveCapabilitiesCacheKey(scope), {
      capabilities: new Set(capabilities),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  async invalidate(scope: TenantUserScope): Promise<void> {
    this.entries.delete(createEffectiveCapabilitiesCacheKey(scope));
  }
}

export function createEffectiveCapabilitiesCacheKey({
  tenantId,
  userId,
}: TenantUserScope): string {
  return `${tenantId}:${userId}`;
}

export function createEffectiveCapabilitiesResolver({
  cache,
  repository,
}: EffectiveCapabilitiesResolverOptions) {
  async function getEffectiveCapabilities(
    scope: TenantUserScope
  ): Promise<EffectiveCapabilities> {
    const cachedCapabilities = await cache?.get(scope);

    if (cachedCapabilities) {
      return { ...scope, capabilities: cachedCapabilities };
    }

    const roleIds = await repository.listUserRoleIds(scope);
    const roleCapabilities = roleIds.length
      ? await repository.listCapabilitiesForRoles({
          tenantId: scope.tenantId,
          roleIds,
        })
      : [];
    const overrides = await repository.listUserCapabilityOverrides(scope);
    const capabilities = applyCapabilityOverrides(roleCapabilities, overrides);

    await cache?.set(scope, capabilities);

    return { ...scope, capabilities };
  }

  async function invalidateEffectiveCapabilities(
    scope: TenantUserScope
  ): Promise<void> {
    await cache?.invalidate(scope);
  }

  async function requireCapability(
    scope: TenantUserScope,
    capabilityCode: CapabilityCode
  ): Promise<EffectiveCapabilities> {
    const effectiveCapabilities = await getEffectiveCapabilities(scope);

    if (!effectiveCapabilities.capabilities.has(capabilityCode)) {
      throw new CapabilityDeniedError(
        scope.userId,
        scope.tenantId,
        capabilityCode
      );
    }

    return effectiveCapabilities;
  }

  return {
    getEffectiveCapabilities,
    invalidateEffectiveCapabilities,
    requireCapability,
  };
}

export function applyCapabilityOverrides(
  roleCapabilities: readonly CapabilityCode[],
  overrides: readonly UserCapabilityOverride[]
): ReadonlySet<CapabilityCode> {
  const capabilities = new Set(roleCapabilities);

  for (const override of overrides) {
    if (override.effect === "allow") {
      capabilities.add(override.capabilityCode);
    }
  }

  for (const override of overrides) {
    if (override.effect === "deny") {
      capabilities.delete(override.capabilityCode);
    }
  }

  return capabilities;
}
