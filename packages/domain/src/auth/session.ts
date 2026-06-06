/**
 * Capa Domain: define el lenguaje del negocio para autenticación.
 *
 * Esta capa no sabe nada de Supabase, Next.js, cookies ni HTTP. Esa separación
 * permite que Application decida reglas usando conceptos estables del dominio,
 * mientras Infrastructure y Web se encargan de los detalles técnicos.
 */

/** Supported user profile states in the local authorization layer. */
export type UserProfileStatus = "active" | "inactive";

/**
 * Canonical error vocabulary for app-session login outcomes.
 */
export type AppAuthErrorCode =
  | "invalid_credentials"
  | "missing_tenant"
  | "inactive_tenant"
  | "inactive_user"
  | "web_access_denied";

/**
 * Authenticated identity as returned by the Identity provider.
 */
export interface AuthUser {
  /** Auth provider user identifier. */
  readonly id: string;
  /** User email address used for login attempts. */
  readonly email: string;
  /** Tenant binding source from auth metadata. */
  readonly tenantId?: string | null;
}

/**
 * App session issued by the backend login use case.
 *
 * La sesión incluye el tenant, roles y capacidades ya resueltas porque las capas
 * externas necesitan una fotografía mínima para responder rápido. Aun así, Web
 * revalida esta fotografía contra el estado actual del servidor antes de confiar
 * en ella para evitar sesiones obsoletas.
 */
export interface AppSession {
  readonly user_id: string;
  readonly auth_user_id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly effective_capabilities: readonly string[];
  readonly status: UserProfileStatus;
  readonly can_access_web: boolean;
}

export type AppAuthSuccess = {
  readonly ok: true;
  readonly session: AppSession;
};

export type AppAuthFailure = {
  readonly ok: false;
  readonly code: AppAuthErrorCode;
};

/**
 * Result of app session login attempts.
 */
export type AppAuthResult = AppAuthSuccess | AppAuthFailure;
