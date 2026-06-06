/**
 * Capa Domain: define el lenguaje del negocio para autenticación.
 *
 * Esta capa no sabe nada de Supabase, Next.js, cookies ni HTTP. Esa separación
 * permite que Application decida reglas usando conceptos estables del dominio,
 * mientras Infrastructure y Web se encargan de los detalles técnicos.
 */

/** Estados posibles del perfil de usuario dentro del dominio de auth. */
export type UserProfileStatus = "active" | "inactive";

/**
 * Códigos de error del login de sesión de aplicación.
 *
 * Son parte del contrato de dominio para que otras capas no dependan de mensajes
 * de infraestructura y puedan responder de forma consistente.
 */
export type AppAuthErrorCode =
  | "invalid_credentials"
  | "missing_tenant"
  | "inactive_tenant"
  | "inactive_user"
  | "web_access_denied";

/**
 * Identidad autenticada que llega desde el proveedor de identidad.
 */
export interface AuthUser {
  /** Identificador del usuario en el proveedor de identidad. */
  readonly id: string;
  /** Email con el que se intenta autenticar. */
  readonly email: string;
  /** Tenant asociado por metadata confiable del proveedor de identidad. */
  readonly tenantId?: string | null;
}

/**
 * Sesión de aplicación emitida por el caso de uso de login backend.
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
 * Resultado tipado del login de aplicación (éxito o error de dominio).
 */
export type AppAuthResult = AppAuthSuccess | AppAuthFailure;
