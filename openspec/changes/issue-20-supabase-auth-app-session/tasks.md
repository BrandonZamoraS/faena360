# Tasks: Supabase Auth App Session

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-760 (additions + deletions; includes tests + migration) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1: Foundation + app-session contract tests, PR2: service + adapters, PR3: migration + schema verification |
| Delivery strategy | stacked-to-main |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation contracts + red tests | PR 1 | Keep implementation off until behavior is captured in failing tests |
| 2 | Core login orchestration and infra adapters | PR 2 | Wires auth, effective capabilities reuse, and web-access gate |
| 3 | Schema migration + constraint verification | PR 3 | Adds `user_profiles.status` and SQL checks for inactive behavior |

## Phase 1: Foundation (contracts + behavior red tests)

- [x] 1.1 Create `packages/domain/src/auth/session.ts` with `UserProfileStatus`, `AppSession`, `AuthUser`, and `AppAuthErrorCode`.
- [x] 1.2 Export new contracts from `packages/domain/src/auth/index.ts` and re-export from `packages/domain/index.ts`.
- [x] 1.3 Create `packages/application/src/auth/index.ts` exports for `LoginWithEmailPasswordService`, `AuthIdentityPort`, `AppSessionRepository`, and auth outcomes.
- [x] 1.4 Add RED tests in `packages/application/src/auth/app-session.test.ts` for all spec scenarios: successful login, `invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user` (missing profile + inactive profile), and `web_access_denied`.

## Phase 2: Core implementation

- [x] 2.1 Implement `packages/application/src/auth/app-session.ts` login service with strict input flow: `email/password` only, no tenant request parameter.
- [x] 2.2 In service flow, enforce tenant binding from `app_metadata.tenant_id`, then load tenant/profile/roles before issuing session.
- [x] 2.3 Enforce source-of-truth checks: `tenants.status` active, `user_profiles.status` active; map any missing profile to `inactive_user`.
- [x] 2.4 Reuse `createEffectiveCapabilitiesResolver` from `packages/application/src/auth/effective-capabilities.ts`; compute capabilities and deny with `web_access_denied` when no role grants web access.
- [x] 2.5 Normalize all failures to the allowed vocabulary: `invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user`, `web_access_denied`.

## Phase 3: Infrastructure + compatibility

- [x] 3.1 Create `packages/infrastructure/src/auth/SupabaseAuthAdapter.ts` that wraps `signInWithPassword` and exposes `AuthIdentityPort`.
- [x] 3.2 Create `packages/infrastructure/src/auth/SupabaseAppSessionRepository.ts` to query tenant, local profile, roles, and `is_web_access`.
- [x] 3.3 Ensure repository interface methods are compatible with existing effective-capabilities consumers so issue #23 logic is reused without duplication.
- [x] 3.4 Export both adapters from `packages/infrastructure/index.ts` and keep `packages/application/src/auth/app-session.ts` SDK-free.

## Phase 4: SQL migration + verification

- [x] 4.1 Create `supabase/migrations/20250609000000_add_user_profile_status.sql` adding `user_profiles.status text not null default 'active' check (status in ('active','inactive'))`.
- [x] 4.2 Update `supabase/tests/authorization_constraints.sql` to assert the new check/default and include inactive-profile fixture for `inactive_user` behavior.

## Phase 5: Test and integration verification

- [x] 5.1 Implement adapter mapping tests in `packages/infrastructure/src/auth/SupabaseAuthAdapter.test.ts` and `packages/infrastructure/src/auth/SupabaseAppSessionRepository.test.ts`.
- [x] 5.2 Finish/align `packages/application/src/auth/app-session.test.ts` assertions after implementation and keep test-first order `RED -> GREEN -> REFACTOR`.
- [x] 5.3 Run typecheck/lint/build and SQL validation checks; document if Supabase integration is environment-gated.
- [x] 5.4 Add/keep apply handoff note: branch is `feat/issue-20-auth-session-foundation` created from `development`, PR slice is stacked-to-main; SQL verification is user-run locally via `supabase reset` followed by `Get-Content` against `supabase/tests/authorization_constraints.sql`; run Codex Review after this PR slice is opened.
