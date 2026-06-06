/**
 * Contrato de capacidades del dominio de autorización.
 *
 * Agrupa identificadores compartidos entre roles, overrides y resolución de
 * capacidades efectivas para que los repositorios e infra compartan el mismo
 * vocabulario sin acoplarse.
 */

export type UserId = string;
export type TenantId = string;
export type RoleId = string;
export type CapabilityCode = string;

export type CapabilityOverrideEffect = "allow" | "deny";

export interface TenantUserScope {
  /** Usuario al que le calculamos permisos dentro de un tenant. */
  readonly userId: UserId;
  /** Tenant donde aplica ese cálculo. */
  readonly tenantId: TenantId;
}

export interface UserCapabilityOverride extends TenantUserScope {
  /** Clave de capacidad que se fuerza permitir o denegar. */
  readonly capabilityCode: CapabilityCode;
  /** Prioridad explícita al conjunto base de capacidades por rol. */
  readonly effect: CapabilityOverrideEffect;
}

export interface EffectiveCapabilities extends TenantUserScope {
  /** Capacidades ya resueltas después de aplicar roles y overrides. */
  readonly capabilities: ReadonlySet<CapabilityCode>;
}
