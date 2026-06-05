# Design: Supabase Auth App Session

## Technical Approach

Add a hexagonal login flow on top of the `development` auth baseline. Domain owns session/error contracts, application owns orchestration and authorization gates, and infrastructure owns Supabase SDK/database access. The app session is issued only after Supabase email/password auth succeeds, tenant is read from `app_metadata.tenant_id`, tenant/profile/user status are active, roles are loaded, issue #23 effective-capabilities are resolved, and at least one assigned role grants web access.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Supabase adapter only | Faster, but mixes vendor I/O with business authorization | Use application service + ports so `packages/application` stays SDK-free |
| Recalculate capabilities inside login | Duplicates issue #23 and risks drift | Reuse `createEffectiveCapabilitiesResolver` from `packages/application/src/auth/effective-capabilities.ts` |
| Source inactive users from auth metadata | Easy to read, not the product source of truth | Add/use `user_profiles.status` as `active`/`inactive`; missing profile maps to `inactive_user` |
| Web access as capability key | Needs an invented capability | Use existing `roles.is_web_access`; deny when no assigned role for the user has it |

## Data Flow

```text
Next route / caller
  -> LoginWithEmailPasswordService
  -> SupabaseAuthAdapter.signInWithPassword(email,password)
  -> app_metadata.tenant_id
  -> AppSessionRepository loads tenant/profile/roles
  -> EffectiveCapabilitiesResolver
  -> AppSession | AppAuthErrorCode
```

The service never accepts tenant input from the request. It trusts only the authenticated Supabase user metadata, then validates DB state for that tenant.

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/domain/src/auth/session.ts` | Create | `AppSession`, `AuthUser`, `UserProfileStatus`, `AppAuthErrorCode` contracts |
| `packages/domain/src/auth/index.ts` | Modify | Export session contracts |
| `packages/application/src/auth/app-session.ts` | Create | Login service, ports, error mapping, auth gates |
| `packages/application/src/auth/app-session.test.ts` | Create | TDD unit scenarios from the spec |
| `packages/application/src/auth/index.ts` and `packages/application/index.ts` | Modify | Export service and types |
| `packages/infrastructure/src/auth/SupabaseAuthAdapter.ts` | Create | Wrap `supabase.auth.signInWithPassword`; normalize invalid credentials |
| `packages/infrastructure/src/auth/SupabaseAppSessionRepository.ts` | Create | Load tenant/profile/roles/capability data using Supabase queries |
| `packages/infrastructure/src/auth/*.test.ts` | Create | Adapter/repository mapping tests using existing Vitest mock style |
| `packages/infrastructure/index.ts` | Modify | Export auth adapters |
| `supabase/migrations/20250609000000_add_user_profile_status.sql` | Create | Add `user_profiles.status text not null default 'active' check (status in ('active','inactive'))` plus index if useful |
| `supabase/tests/authorization_constraints.sql` | Modify | Assert `user_profiles.status` default/check and inactive fixture support |

## Interfaces / Contracts

```ts
type AppAuthErrorCode = "invalid_credentials" | "missing_tenant" | "inactive_tenant" | "inactive_user" | "web_access_denied";
type UserProfileStatus = "active" | "inactive";

type AppSession = {
  user_id: string;
  auth_user_id: string;
  tenant_id: string;
  email: string;
  roles: readonly string[];
  effective_capabilities: readonly string[];
  status: UserProfileStatus;
};

interface AuthIdentityPort {
  signInWithPassword(input: { email: string; password: string }): Promise<AuthUser>;
}
```

`AppSessionRepository` should expose tenant/profile/roles loading methods compatible with `EffectiveCapabilitiesRepository` so one Supabase repository can satisfy both login and capability resolution.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Success, invalid credentials, missing tenant, inactive tenant, missing/inactive profile, no web role | TDD in `packages/application/src/auth/app-session.test.ts`; watch each spec case fail first |
| Unit | Supabase auth error and metadata mapping | Vitest mocks like `SupabaseStorageAdapter.test.ts` |
| SQL | `user_profiles.status` default/check and existing active rows | Extend `supabase/tests/authorization_constraints.sql` |
| Integration | Optional local Supabase login path | Conditional script/test only when Supabase env is available |

## Migration / Rollout

Create a forward-only migration adding `user_profiles.status` with default `active`, backfilling existing rows via the default, then enforcing the check constraint. Roll out from a feature branch based on `development`; no production-based implementation branch.

## Open Questions

None.
