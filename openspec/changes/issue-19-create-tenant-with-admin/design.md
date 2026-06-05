# Design: Create Tenant with First Admin

## Technical Approach

Implement an operator-only TypeScript script in `supabase/scripts/` that uses the Supabase Admin client with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The script validates all inputs before persistence, verifies the authoritative default role-capability mapping exists, creates Auth + database resources in a tracked sequence, and compensates on failure. No frontend changes are in scope.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| TypeScript Supabase Admin script in `supabase/scripts/create-tenant-with-admin.ts` | PL/pgSQL procedure, shell script, `packages/cli` | Auth user creation must use Auth Admin APIs; TypeScript gives safer validation/rollback than shell while keeping the first operator script colocated with Supabase infra. |
| Preflight blocks before any write | Lazy validation during writes | Spec requires no persisted resources when required data, duplicates, or role-capability mapping are invalid. |
| Track created resources and compensate in reverse order | Assume DB transaction covers all work | Auth creation is outside Postgres transactions. Reverse compensation is the only safe cross-system rollback pattern. |
| Do not write `audit_log` during onboarding | Log bootstrap as an audit row | `audit_log.tenant_id` is `ON DELETE RESTRICT`; writing audit rows would block tenant deletion during failed-run compensation. Runbook can record operator evidence outside DB until an explicit audit design exists. |
| Role grants come only from documented mapping module/source | Generate empty/default grants | Spec explicitly forbids invented grants. Missing or incomplete mapping is a blocking preflight error. |

## Data Flow

```text
Operator input JSON/env
  -> parse + validate formats and duplicates
  -> load documented role-capability mapping
  -> create Auth user with app_metadata.tenant_id after tenant id is known
  -> insert tenant -> user_profile -> roles -> role_capabilities -> user_roles
  -> on error: delete user_roles/role_capabilities/roles/profile/tenant/Auth user
```

Sequence:

```text
validate request ──> validate mapping ──> create tenant
                                          └─> create auth user(app_metadata.tenant_id)
                                              └─> create profile + roles + grants + admin assignment
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/scripts/create-tenant-with-admin.ts` | Create | CLI/operator entrypoint, input parsing, validation, orchestration, compensation. |
| `supabase/scripts/default-role-bootstrap.ts` | Create | Documented role names, web-access flags, and capability grants; implementation must leave mapping empty/blocking until authoritative grants are supplied. |
| `supabase/docs/create-tenant-with-admin.md` | Create | Operator runbook: required env vars, input shape, dry-run/preflight expectations, rollback behavior, secret handling. |
| `supabase/tests/create_tenant_with_admin.sql` | Create | SQL verification fixture for DB-side outcome/constraints after scripted bootstrap; not run automatically by agent due Supabase command gate. |
| `package.json` | Modify | Add operator script command, likely `tenant:create-admin`, using `tsx` if dependency is added. |
| `supabase/seed.sql` | No change | Runtime onboarding remains separate from seed data. |

## Interfaces / Contracts

```ts
type TenantOnboardingRequest = {
  tenant: { name: string; slug: string; timezone: string; currency: string; fuelUnit: "liters" | "gallons_us" | "gallons_imperial" };
  admin: { email: string; temporaryPassword: string; fullName?: string; phone?: string };
};

type DefaultRole = {
  name: "administrador" | "supervisor" | "operador" | "mantenimiento" | "repartidor_de_combustible";
  isSystem: true;
  isWebAccess: boolean;
  capabilityKeys: string[];
};
```

Preflight contract: reject before persistence when tenant slug exists, admin email/Auth identity exists, timezone/currency/fuel unit is invalid, required profile data is absent, or any role capability key is missing from `capabilities`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Input validation, duplicate preflight branching, compensation order, missing mapping block | Vitest-style tests if added for script helpers; repo already has Vitest in workspace packages. |
| Integration | Tenant/profile/roles/grants/admin assignment shape and duplicate constraints | `supabase/tests/create_tenant_with_admin.sql`; commands documented only, not run without explicit authorization. |
| E2E | Operator runbook execution | Manual runbook checklist against local/staging Supabase with service-role env vars. |
| Quality | TypeScript and lint | `pnpm build`, `pnpm lint`; no Supabase CLI commands. |

## Migration / Rollout

No database migration required unless the authoritative capability catalog/mapping is formalized as seed/migration in a separate change. Roll out as an operator script plus runbook. First production use should run preflight/dry-run, then execute once with service-role credentials stored outside source control.

## Open Questions

- [ ] What exact authoritative role-to-capability mapping should populate `default-role-bootstrap.ts`? This blocks implementation of grants.
- [ ] Should the capability catalog be created by this onboarding script, or must it already exist from a separate seed/migration?
