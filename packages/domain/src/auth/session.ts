/**
 * Domain contracts for web app session authentication.
 */

/** Supported user profile states in the local authorization layer. */
export type UserProfileStatus = "active" | "inactive";

/** Canonical error vocabulary for app-session login outcomes. */
export type AppAuthErrorCode =
  | "invalid_credentials"
  | "inactive_tenant"
  | "inactive_user"
  | "web_access_denied";

/** Authenticated identity as returned by the identity provider. */
export interface AuthUser {
  /** Auth provider user identifier. */
  readonly id: string;
  /** User email address used for login attempts. */
  readonly email: string;
  /** Tenant binding source from auth metadata. */
  readonly tenantId?: string | null;
}

/** App session issued by the backend login use case. */
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

/** Result of app-session login attempts. */
export type AppAuthResult = AppAuthSuccess | AppAuthFailure;
