# Tasks: Create Tenant with First Admin

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 620–920 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (contracts + validation) → PR 2 (orchestration + rollback) → PR 3 (runbook + verification fixtures) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation + mapping contracts | PR 1 | Base branch `main`; creates `supabase/scripts/default-role-bootstrap.ts` and request validators |
| 2 | Core onboarding orchestration | PR 2 | Depends on PR 1; includes ordered create/rollback in script |
| 3 | Runbook and SQL verification | PR 3 | Depends on PR 2 behavior and output contracts |

## Phase 1: Foundation

- [x] 1.1 Create `supabase/scripts/` directory and add `supabase/scripts/default-role-bootstrap.ts` with `DefaultRole` type, five required system roles, web-access flags, and capability-key contracts.
- [x] 1.2 Add `TenantOnboardingRequest`, `TenantInputs`, and `AdminInputs` types in `supabase/scripts/create-tenant-with-admin.ts` plus centralized parse/validation helpers.
- [x] 1.3 In `supabase/scripts/create-tenant-with-admin.ts`, add preflight checks for duplicate tenant slug, existing admin email/Auth identity, invalid timezone/currency/fuel unit, and missing required profile fields.
- [x] 1.4 Add helper utilities in `supabase/scripts/create-tenant-with-admin.ts` for capability-map validation and idempotency markers so duplicates are rejected before persistence.

## Phase 2: Core Implementation (Operator Bootstrap)

- [x] 2.1 Implement CLI execution path in `supabase/scripts/create-tenant-with-admin.ts` using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` with admin Auth + PostgREST calls.
- [x] 2.2 Implement ordered creation flow: insert tenant, create Auth user (`app_metadata.tenant_id`), create profile, seed roles, grant role capabilities, and assign admin role.
- [x] 2.3 Implement reverse-order compensation in `supabase/scripts/create-tenant-with-admin.ts` for every step (roles, grants, assignments, profile, tenant, Auth user).
- [x] 2.4 Update root `package.json` with `tenant:create-admin` script (e.g., `tsx supabase/scripts/create-tenant-with-admin.ts`) and ensure required runner/runtime dependency is declared.

## Phase 3: Integration / Testing / Verification

- [x] 3.1 Create `supabase/tests/create_tenant_with_admin.sql` with positive flow assertions for tenant, Auth-bound profile, five roles, and admin assignment under one tenant.
- [x] 3.2 Add negative SQL checks for invalid request shape, duplicate slug/email rerun, and unsupported timezone/currency/fuel values with no persisted artifacts.
- [x] 3.3 Add rollback verification SQL assertions that partial creations are removed when any onboarding step fails after earlier writes.
- [x] 3.4 Add mapping-block test in `supabase/tests/create_tenant_with_admin.sql` ensuring onboarding fails when documented capability mapping is missing or incomplete.

## Phase 4: Documentation

- [x] 4.1 Create `supabase/docs/create-tenant-with-admin.md` with input schema, required env vars, command usage, sample payload, success output, and safety guardrails.
- [x] 4.2 Document recovery and rerun behavior in `supabase/docs/create-tenant-with-admin.md`, including partial-run cleanup and duplicate-safe operator workflow.
- [x] 4.3 Add manual verification checklist in `supabase/docs/create-tenant-with-admin.md` for dry-run, successful bootstrap, failure rollback, and script rerun behavior.
