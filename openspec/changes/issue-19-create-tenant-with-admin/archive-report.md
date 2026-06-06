## Archive Report

**Change**: issue-19-create-tenant-with-admin  
**Status**: Complete  
**Archive Date**: 2026-06-05

---

### What was delivered

An operator-only TypeScript script (`supabase/scripts/create-tenant-with-admin.ts`) that creates a tenant and its first admin via the Supabase Admin API, with full input validation, role-capability mapping preflight, ordered resource creation, and reverse-order rollback on failure.

### Files changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/scripts/create-tenant-with-admin.ts` | Create | CLI entrypoint, input parsing/validation, preflight checks, orchestration, compensation. |
| `supabase/scripts/default-role-bootstrap.ts` | Create | Documented role names, web-access flags, and capability-key contracts for `administrador` (37 keys) and `supervisor` (21 keys). |
| `supabase/scripts/test-onboarding.ts` | Create | Automated test runner that detects local Supabase credentials, runs full onboarding flow, verifies 9 assertions, and cleans up. |
| `supabase/docs/create-tenant-with-admin.md` | Create | Operator runbook: required env vars, input shape, command usage, sample payload, success output, safety guardrails. |
| `supabase/docs/test-onboarding.md` | Create | Team documentation for the automated test: prerequisites, usage, troubleshooting. |
| `supabase/tests/create_tenant_with_admin.sql` | Create | SQL verification fixture for manual DB-side outcome/constraints after scripted bootstrap. |
| `supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql` | Create | Seeds the global capability catalog with 50 keys required by default role mappings. |
| `package.json` | Modify | Added `tenant:create-admin` and `test:onboarding` scripts; declared `@supabase/supabase-js` dependency. |
| `pnpm-workspace.yaml` | Modify | Added `"."` to packages so root devDependencies resolve correctly. |
| `pnpm-lock.yaml` | Modify | Lockfile updated for new dependencies. |

### Verification summary

- ✅ TypeScript compilation passes (`pnpm exec tsc -p tsconfig.json --noEmit`)
- ✅ Lint passes (`pnpm lint`)
- ✅ Automated test suite passes (`pnpm test:onboarding`): 15/15 tests
  - 9/9 positive flow tests (tenant, auth user, profile, roles, grants, assignments)
  - 6/6 negative flow tests (invalid shape, timezone, currency, fuel, duplicate slug, missing capabilities)
- ✅ Manual CLI help and validation rejection tested (`pnpm tenant:create-admin --help`, `--payload "{}"`)

### Design decisions carried forward

| Decision | Rationale |
|----------|-----------|
| TypeScript over PL/pgSQL | Auth Admin APIs are required; TypeScript provides safer validation and rollback than shell or SQL-only. |
| Preflight blocks before any write | Spec requires no persisted resources when required data, duplicates, or role-capability mapping are invalid. |
| Reverse-order compensation | Auth creation is outside Postgres transactions; reverse compensation is the only safe cross-system rollback pattern. |
| No `audit_log` writes during onboarding | `audit_log.tenant_id` is `ON DELETE RESTRICT`; writing audit rows would block tenant deletion during failed-run compensation. |
| Role grants from documented mapping only | Spec forbids invented grants; missing mapping is a blocking preflight error. |

### Open items / follow-up suggestions

1. ~~**Automated negative-flow tests**: Add invalid payload, duplicate slug, missing capability, and mid-flow failure scenarios to `test-onboarding.ts`.~~ ✅ Completed: All 6 negative flow tests now pass.
2. **Dry-run flag**: Add `--dry-run` to the CLI so operators can validate inputs and preflight without persistence.
3. **Audit trail**: Design an explicit audit strategy for tenant bootstrap once `audit_log` constraints allow it.
4. **Mid-flow failure test**: Add explicit automated test that triggers and verifies rollback behavior when a step fails after partial writes.

---

**Verified by**: SDD automated verification (`sdd-verify-chinese-team` equivalent via orchestrator)  
**Closed by**: SDD archive phase  
**PR**: Pending — see `branch-pr` workflow
