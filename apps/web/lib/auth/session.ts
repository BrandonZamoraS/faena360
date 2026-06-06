import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { type AppSession } from "@faena360/domain";
import type { AppSessionRepository } from "@faena360/application";

export const APP_SESSION_COOKIE_NAME = "faena360.app-session";
const APP_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const APP_SESSION_COOKIE_TTL_MILLISECONDS = APP_SESSION_COOKIE_MAX_AGE_SECONDS * 1000;
const APP_SESSION_COOKIE_VERSION = "v1";
const WEB_ACCESS_CAPABILITY = "web.portal.access";

type SignedAppSessionToken = {
  version: string;
  issuedAtEpochMs: number;
  payload: string;
  signature: string;
};

export interface CookieContainer {
  get(name: string): { value: string } | undefined;
}

export type AppSessionRefresher = (session: AppSession) => Promise<AppSession | null>;

export interface GetAppSessionOptions {
  readonly sessionRefresher?: AppSessionRefresher;
}

export function createServerStateSessionRefresher(
  repository: AppSessionRepository
): AppSessionRefresher {
  return async (session) => {
    try {
      const tenant = await repository.getTenant({ tenantId: session.tenant_id });
      if (tenant.status !== "active") {
        return null;
      }

      const userProfile = await repository.getUserProfile({
        tenantId: session.tenant_id,
        authUserId: session.auth_user_id,
      });

      if (
        !userProfile ||
        userProfile.status !== "active" ||
        userProfile.tenantId !== session.tenant_id
      ) {
        return null;
      }

      const roles = await repository.listUserRoles({
        tenantId: tenant.id,
        userId: userProfile.userId,
      });

      const effectiveCapabilities = await resolveEffectiveCapabilities({
        repository,
        tenantId: tenant.id,
        userId: userProfile.userId,
        roleIds: roles,
      });

      const canAccessWeb = await repository.hasWebAccessRole({
        tenantId: tenant.id,
        userId: userProfile.userId,
        roleIds: roles,
      });

      const hasWebPortalAccessCapability = effectiveCapabilities.includes(
        WEB_ACCESS_CAPABILITY
      );

      return {
        user_id: userProfile.userId,
        auth_user_id: session.auth_user_id,
        tenant_id: tenant.id,
        email: userProfile.email ?? session.email,
        roles,
        effective_capabilities: effectiveCapabilities,
        status: userProfile.status,
        can_access_web: canAccessWeb && hasWebPortalAccessCapability,
      };
    } catch {
      return null;
    }
  };
}

export type AuthGuardResult =
  | { ok: true; session: AppSession }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

export async function getAppSession(
  cookies: CookieContainer,
  options?: GetAppSessionOptions
): Promise<AppSession | null> {
  const rawSession = cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  if (!rawSession) {
    return null;
  }

  const parsed = parseSignedSessionToken(rawSession);
  if (!parsed) {
    return null;
  }

  try {
    const decodedPayload = Buffer.from(parsed.payload, "base64url").toString("utf8");
    const parsedSession = JSON.parse(decodedPayload);
    const session = normalizeAppSession(parsedSession);
    if (!session) {
      return null;
    }

    if (!options?.sessionRefresher) {
      return session;
    }

    try {
      return await options.sessionRefresher(session);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function requireAuth(
  cookies: CookieContainer,
  options?: GetAppSessionOptions
): Promise<AuthGuardResult> {
  const session = await getAppSession(cookies, options);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "invalid_session",
          message: "No valid authenticated session found.",
        },
        { status: 401 }
      ),
    };
  }

  return { ok: true, session };
}

export async function requireWebAccess(
  cookies: CookieContainer,
  options?: GetAppSessionOptions
): Promise<AuthGuardResult> {
  const authResult = await requireAuth(cookies, options);

  if (!authResult.ok) {
    return authResult;
  }

  if (
    !authResult.session.can_access_web ||
    !authResult.session.effective_capabilities.includes(WEB_ACCESS_CAPABILITY)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "web_access_denied",
          message: "Your role does not allow web access.",
        },
        { status: 403 }
      ),
    };
  }

  return authResult;
}

async function resolveEffectiveCapabilities(input: {
  readonly repository: AppSessionRepository;
  readonly tenantId: string;
  readonly userId: string;
  readonly roleIds: readonly string[];
}): Promise<string[]> {
  const roleCapabilities = await input.repository.listTenantRoleCapabilities({
    tenantId: input.tenantId,
    roleIds: input.roleIds,
  });

  const overrides = await input.repository.listUserCapabilityOverrides({
    tenantId: input.tenantId,
    userId: input.userId,
  });

  const capabilities = new Set<string>(roleCapabilities);

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

  return [...capabilities];
}

export function writeAppSessionCookie(
  response: ReturnType<typeof NextResponse.json>,
  session: AppSession
): void {
  const token = createSignedAppSessionToken(session);

  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: true,
    maxAge: APP_SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearAppSessionCookie(
  response: ReturnType<typeof NextResponse.json>
): void {
  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: 0,
  });
}

function normalizeAppSession(value: unknown): AppSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AppSession>;

  if (
    typeof candidate.user_id !== "string" ||
    candidate.user_id.length === 0 ||
    typeof candidate.auth_user_id !== "string" ||
    candidate.auth_user_id.length === 0 ||
    typeof candidate.tenant_id !== "string" ||
    candidate.tenant_id.length === 0 ||
    typeof candidate.email !== "string" ||
    !Array.isArray(candidate.roles) ||
    !Array.isArray(candidate.effective_capabilities) ||
    (candidate.status !== "active" && candidate.status !== "inactive") ||
    typeof candidate.can_access_web !== "boolean"
  ) {
    return null;
  }

  return {
    user_id: candidate.user_id,
    auth_user_id: candidate.auth_user_id,
    tenant_id: candidate.tenant_id,
    email: candidate.email,
    roles: [...candidate.roles],
    effective_capabilities: [...candidate.effective_capabilities],
    status: candidate.status,
    can_access_web: candidate.can_access_web,
  };
}

function createSignedAppSessionToken(session: AppSession): string {
  const payload = createSerializedSessionPayload(session);
  const issuedAtEpochMs = Date.now();
  const signature = createTokenSignature({
    version: APP_SESSION_COOKIE_VERSION,
    issuedAtEpochMs,
    payload,
  });

  return [
    APP_SESSION_COOKIE_VERSION,
    issuedAtEpochMs.toString(),
    payload,
    signature,
  ].join(".");
}

function createSerializedSessionPayload(session: AppSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function parseSignedSessionToken(rawCookie: string): SignedAppSessionToken | null {
  const parts = rawCookie.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const [version, issuedAtEpochMsString, payload, signature] = parts;
  if (version !== APP_SESSION_COOKIE_VERSION) {
    return null;
  }

  const issuedAtEpochMs = Number(issuedAtEpochMsString);
  if (!Number.isFinite(issuedAtEpochMs)) {
    return null;
  }

  if (Date.now() - issuedAtEpochMs > APP_SESSION_COOKIE_TTL_MILLISECONDS) {
    return null;
  }

  let expectedSignature: string;
  try {
    expectedSignature = createTokenSignature({
      version,
      issuedAtEpochMs,
      payload,
    });
  } catch {
    return null;
  }

  if (!timingSafeEqualStrings(expectedSignature, signature)) {
    return null;
  }

  return {
    version,
    issuedAtEpochMs,
    payload,
    signature,
  };
}

function createTokenSignature(input: {
  version: string;
  issuedAtEpochMs: number;
  payload: string;
}): string {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing APP_SESSION_SECRET.");
  }

  const hmac = createHmac("sha256", secret);
  hmac.update(`${input.version}.${input.issuedAtEpochMs}.${input.payload}`);

  return hmac.digest("base64url");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const first = Buffer.from(a, "utf8");
  const second = Buffer.from(b, "utf8");

  return timingSafeEqual(first, second);
}
