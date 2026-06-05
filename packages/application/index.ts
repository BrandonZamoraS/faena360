export {
  applyCapabilityOverrides,
  CapabilityDeniedError,
  createEffectiveCapabilitiesCacheKey,
  createEffectiveCapabilitiesResolver,
  InMemoryEffectiveCapabilitiesCache,
  LoginWithEmailPasswordServiceImpl,
} from "./src/auth";

export type {
  EffectiveCapabilitiesCache,
  EffectiveCapabilitiesRepository,
  EffectiveCapabilitiesResolverOptions,
  AppAuthErrorCode,
  AppAuthFailure,
  AppAuthResult,
  AppAuthSuccess,
  AppSession,
  AuthUser,
  LoginInput,
  LoginWithEmailPasswordOutcome,
  LoginWithEmailPasswordService,
  AuthIdentityPort,
  AppSessionRepository,
  UserCapabilityOverride,
} from "./src/auth";
