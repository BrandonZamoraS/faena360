# Proposal: Create Tenant with First Admin

## Intent

Automate the current manual onboarding gap for creating a tenant and its first administrator. Faena360 needs a repeatable operator-facing process that creates the Auth user, tenant base record, local profile, base roles, and initial admin assignment without relying on ad-hoc SQL or Studio clicks.

## Scope

### In Scope
- Define a manual-but-scripted onboarding flow for tenant + first admin creation.
- Provision tenant data, first admin profile, tenant roles, and default authorization bootstrap.
- Document required inputs, validation, rollback behavior, and operator runbook.

### Out of Scope
- End-user UI for self-service tenant signup.
- General tenant lifecycle tooling beyond initial bootstrap.

## Capabilities

### New Capabilities
- `tenant-onboarding`: Manual operator workflow that creates a tenant, first admin Auth identity, local profile, default roles, and safe rollback rules.

### Modified Capabilities
- None.

## Approach

Use a TypeScript operator script under `supabase/scripts/` that calls Supabase Auth Admin APIs plus database writes with the service role key. The flow should validate tenant/admin inputs up front, create resources in a controlled sequence, and compensate on failure by deleting created Auth or database records. Default role bootstrap and runbook requirements are defined at spec level.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/issue-19-create-tenant-with-admin/proposal.md` | New | Proposal artifact for this change |
| `openspec/changes/issue-19-create-tenant-with-admin/specs/tenant-onboarding/spec.md` | New | New capability spec expected next |
| `supabase/scripts/` | Modified | Planned home for onboarding script |
| `supabase/docs/` | Modified | Planned operator runbook |
| `supabase/tests/` | Modified | Planned integration coverage for bootstrap flow |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Service role misuse or leakage | Med | Require env-based secrets handling and runbook warnings |
| Partial bootstrap on failure | Med | Specify compensation steps and idempotency checks |
| Undefined default role/capability mapping | High | Lock mapping in specs before implementation |

## Rollback Plan

Revert the script and runbook changes. For failed executions, the documented rollback MUST remove any created Auth user, tenant profile, role assignments, and tenant record created by that run.

## Dependencies

- Supabase service-role credentials available outside source control.
- Confirmed default role and capability mapping for bootstrap.

## Success Criteria

- [ ] Specs define a single operator workflow for tenant + first admin bootstrap.
- [ ] Required inputs, validation, bootstrap outputs, and rollback rules are explicit.
- [ ] Capability contract is clear enough for sdd-spec to create the delta without guessing.
