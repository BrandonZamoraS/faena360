# Proposal: Supabase Auth App Session

## Intent

Enable backend login with Supabase Auth while keeping Faena360 business rules in domain/application layers. The change must produce an app session only after tenant, profile, user status, role, capability, and web-access validation succeed.

## Scope

### In Scope
- Add an auth port/adapter flow for email/password login.
- Build an application service that resolves tenant only from `app_metadata.tenant_id` and returns the app session contract.
- Validate `tenants.status`, local profile existence, `user_profiles.status`, roles, effective capabilities, and web access; map expected auth errors.

### Out of Scope
- Login UI, password recovery, tenant/admin creation, admin bootstrap.
- Non-web channels or multi-tenant switching in the client.

## Capabilities

### New Capabilities
- `app-session-auth`: Authenticate with Supabase Auth and create a tenant-scoped Faena360 app session with backend authorization checks.

### Modified Capabilities
- None.

## Approach

Use a split design: domain session/error vocabulary, application login service + session builder, and a Supabase adapter behind a port. Reuse the existing effective-capabilities resolver from issue #23. Treat `user_profiles.status` (`active` / `inactive`) as the source of truth for `inactive_user`; add schema support if missing.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/application/src/auth/*` | Modified | Login orchestration, session assembly, authorization checks |
| `packages/domain/src/auth/*` | Modified | App session and auth error contracts |
| `packages/infrastructure/src/auth/*` | New | Supabase auth adapter and mapping layer |
| `supabase/migrations/*` | Modified | Add/use `user_profiles.status` if absent |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Current schema lacks `user_profiles.status` | Med | Include migration/update in the change scope |
| Capability/session logic diverges from issue #23 | Med | Reuse existing resolver instead of duplicating logic |
| Work starts from wrong branch baseline | Low | Implement later from `development` only |

## Rollback Plan

Revert the auth adapter/service wiring and any related migration, then fall back to the pre-login state with no app-session endpoint enabled.

## Dependencies

- Supabase project/config for Auth login.
- Existing effective-capabilities resolver from issue #23 on `development`.

## Success Criteria

- [ ] Email/password login returns `user_id`, `auth_user_id`, `tenant_id`, `email`, `roles`, `effective_capabilities`, and `status`.
- [ ] Failures map to only: `invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user`, `web_access_denied`.
- [ ] Domain/application layers do not import Supabase SDKs.
