export type UserId = string;
export type TenantId = string;
export type RoleId = string;
export type CapabilityCode = string;

export type CapabilityOverrideEffect = "allow" | "deny";

export interface TenantUserScope {
  readonly userId: UserId;
  readonly tenantId: TenantId;
}

export interface UserCapabilityOverride extends TenantUserScope {
  readonly capabilityCode: CapabilityCode;
  readonly effect: CapabilityOverrideEffect;
}

export interface EffectiveCapabilities extends TenantUserScope {
  readonly capabilities: ReadonlySet<CapabilityCode>;
}
