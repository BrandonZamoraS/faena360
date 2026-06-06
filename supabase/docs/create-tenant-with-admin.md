# Tenant Onboarding (First-Admin Bootstrap)

This runbook documents the operator flow for Issue 19: creating one tenant and its
first administrator from a single script.

## Command

- Script: `supabase/scripts/create-tenant-with-admin.ts`
- NPM script: `pnpm tenant:create-admin`

Usage:

```bash
pnpm tenant:create-admin --payload '{"tenant":{...},"admin":{...}}'
```

Examples for local/manual runs:

```bash
pnpm tenant:create-admin --payload '{"tenant":{"name":"Acme Logistics","slug":"acme-logistics","timezone":"America/Argentina/Buenos_Aires","currency":"USD","fuelUnit":"liters"},"admin":{"email":"admin@acme.local","temporaryPassword":"change-me-123","fullName":"Ops Admin"}}'
```

Payload may also be passed via `--payload-file <path>` or stdin when running in
CI scripts.

## Required environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Both values must come from a trusted operator environment. Never commit these
values to source control.

## Request schema

```ts
type TenantOnboardingRequest = {
  tenant: {
    name: string;
    slug: string;
    timezone: string; // must be valid IANA timezone
    currency: string; // ISO-4217 currency code (e.g. USD)
    fuelUnit: "liters" | "gallons_us" | "gallons_imperial";
  };
  admin: {
    email: string; // valid email
    temporaryPassword: string; // minimum 6 chars
    fullName: string; // required for initial profile
    phone?: string; // optional
  };
};
```

## Validation and preflight (must pass before persistence)

The script validates these before creating any row:

- tenant slug uniqueness
- admin email uniqueness (Auth identity + local profile)
- tenant timezone validity
- tenant currency validity
- fuel unit validity (`liters`, `gallons_us`, `gallons_imperial`)
- required profile fields (`admin.fullName` + email + temporary password length)
- documented default role-capability contract presence (`capabilities` keys for all
  required defaults are required before startup)

The global catalog for these keys is seeded by:
`supabase/migrations/20250608000000_seed_default_authorization_capabilities.sql`.
If your local database has not applied this migration, positive-path onboarding
will fail preflight until those rows exist.

If any preflight fails, the workflow exits with a `TENANT_ONBOARDING_FAILED`
error and **does not persist** tenant/profile/auth records.

## Default role capability source

Default role grants are loaded from `supabase/scripts/default-role-bootstrap.ts`.
That module is the authoritative mapping source for onboarding and follows
the section 14 constraints in the system statement.

- `administrador`: full tenant platform management coverage for configuration,
  reporting, registration modules, and change approvals/rejections.
- `supervisor`: broad read visibility plus manual finance/workflow rights,
  including change creation/approval/rejection.
- `operador`, `mantenimiento`, `repartidor_de_combustible`: these roles keep
  web access disabled in baseline (`isWebAccess: false`) and no default web
  capabilities are assigned because their flows are WhatsApp-first.

If any required capability key from this source is missing from the global
`capabilities` catalog, onboarding fails during preflight and persists nothing.

## Expected success output

On success the command prints JSON similar to:

```json
{
  "ok": true,
  "tenantId": "<tenant-id>",
  "tenantSlug": "<slug>",
  "authUserId": "<auth-user-id>",
  "profileId": "<profile-id>",
  "roleCount": 5
}
```

On failure the output is prefixed as:

```text
TENANT_ONBOARDING_FAILED: Preflight checks failed:
... or other onboarding reason
```

## Runtime behavior

- The flow creates, in order:
  1. tenant
  2. Auth user (`app_metadata.tenant_id`)
  3. local user profile
  4. five tenant roles (default system role set)
  5. role-capability grants
  6. first admin assignment (role `administrador`)
- In failure, the script attempts reverse compensation in this order:
  `user_roles -> role_capabilities -> roles -> user_profiles -> tenants -> auth.users`

This reverse order protects partial state across Auth + Postgres.

## Recovery and rerun behavior

### Safe rerun

The command is idempotent on identity checks.

- Re-running the same tenant slug or same admin email is rejected before write.
- Existing valid tenant/admin pair remains unchanged.

### Partial-failure recovery

- If any onboarding step fails after earlier writes, the script runs rollback and
  removes any partially created resources for that attempt.
- Verify by checking there are zero rows for the same tenant slug / admin email.

### Mapping-block recovery

If the role-capability mapping source is missing or incomplete, onboarding stops
before persistence and returns an explicit preflight error. No manual DB cleanup is
required because nothing is written.

## Manual verification checklist

Use `supabase/tests/create_tenant_with_admin.sql` as the primary DB assertion
artifact. The SQL fixture only validates persisted state and does not require
service-role credentials.

### 1) Local DB assertions (no Auth credentials)

Run this from a local terminal once your local Postgres database is reachable
and after applying migrations including:
`20250608000000_seed_default_authorization_capabilities.sql`:

```powershell
$ErrorActionPreference = 'Stop'
$env:POSTGRES_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$testsPath = (Resolve-Path 'supabase/tests').Path.Replace('\\', '/')

docker run --rm -i --network host `
  -v "${testsPath}:/sql:ro" `
  postgres:16 psql "$env:POSTGRES_URL" -v ON_ERROR_STOP=1 -f /sql/create_tenant_with_admin.sql
```

If this command passes, each expected scenario appears as `PASS`/`SKIP` notices.
Scenarios that were not run intentionally are reported as `SKIP` and can be skipped
in that verification pass.

### 2) Operator run (requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)

Use `--payload-file` with UTF-8 (no BOM) files to avoid shell quoting issues.

```powershell
# Example payload helper (optional)
$payloadDir = Join-Path $PWD '.issue19-fixture-payloads'
New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null

@'
{
  "tenant": {
    "name": "Issue 19 Fixture Tenant",
    "slug": "issue19-fixture-success",
    "timezone": "UTC",
    "currency": "USD",
    "fuelUnit": "liters"
  },
  "admin": {
    "email": "admin-success@issue19.local",
    "temporaryPassword": "change-me-123",
    "fullName": "Fixture Admin"
  }
}'@ | Set-Content (Join-Path $payloadDir 'success.json') -Encoding utf8NoBOM

pnpm tenant:create-admin --payload-file (Join-Path $payloadDir 'success.json')
```

Then rerun the DB assertion command above.

Additional scenarios can be tested with equivalent payload files for:

- invalid inputs (shape/timezone/currency/fuel)
- duplicate run
- mapping-block preflight
- rollback drill (manual induction)

## Safety guardrails

- Always pass JSON from trusted operator terminals.
- Use short-lived environment variables and rotate service-role credentials if they
  were displayed/logged.
- Do not edit script output assumptions in production unless you re-run the full
  verification checks.
