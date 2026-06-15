# Audit Log System Specification

## Purpose

Define reusable application-layer audit infrastructure. Every sensitive mutation MUST record who acted, from where, what changed (before/after), and when. Entries MUST be append-only, tenant-scoped, and sanitize sensitive fields.

## Requirements

### Requirement: Audit entry persistence

The system MUST persist audit entries with tenant_id, actor_user_id, target_user_id, action, source, old_value, new_value, and occurred_at. Platform code MUST NOT UPDATE or DELETE audit records — the table is append-only. Tenant isolation MUST be enforced via RLS.

#### Scenario: Mutation creates audit entry
- GIVEN a sensitive mutation completes successfully
- WHEN the audit entry is written
- THEN tenant_id, actor, action, source, and occurred_at are recorded

#### Scenario: Audit records are append-only
- GIVEN an existing audit entry
- WHEN platform code attempts UPDATE or DELETE
- THEN the operation is denied by data store enforcement

#### Scenario: Cross-tenant audit access denied
- GIVEN a user authenticated for tenant A
- WHEN reading audit entries for tenant B
- THEN no rows are returned

### Requirement: Audit source tracing

Every audit entry MUST record where the action originated via the `source` field. Valid sources are: `web`, `whatsapp`, `script`, `system`.

#### Scenario: Web action records source
- GIVEN a user performs a mutation via the web UI
- WHEN the audit entry is written
- THEN source is `web`

#### Scenario: Script action records source
- GIVEN a service role script performs tenant creation
- WHEN the audit entry is written
- THEN source is `script`

### Requirement: Change diff tracking

For mutations that modify existing data, audit MUST capture `old_value` and `new_value` as JSONB containing only changed fields. For creation actions, only `new_value` is required.

#### Scenario: Update captures before/after diff
- GIVEN a user profile update changes display_name and phone
- WHEN the audit entry is written
- THEN old_value contains only previous display_name and phone, new_value contains the updated values

#### Scenario: Creation captures initial state
- GIVEN a new role is created
- WHEN the audit entry is written
- THEN old_value is NULL and new_value contains the created fields

### Requirement: Sensitive field sanitization

Audit entries MUST NOT contain passwords, tokens, or secrets. Such fields MUST be replaced with a sentinel value before storage.

#### Scenario: Password field is sanitized
- GIVEN a mutation includes a password field
- WHEN the diff is computed for audit
- THEN the password value is replaced with `[REDACTED]`

### Requirement: Audit write guarantee

Audit entries MUST only be written after the business operation succeeds. If the operation fails or is rolled back, no audit entry is written.

#### Scenario: Failed operation produces no audit
- GIVEN a role change operation that fails
- WHEN the failure occurs
- THEN no audit entry exists for that attempt

### Requirement: Authorization mutation audit

Role changes, capability overrides, user creation, edition, deactivation, reactivation, and tenant configuration changes MUST produce audit entries.

#### Scenario: Capability override is audited
- GIVEN a supervisor creates a deny override for a user capability
- WHEN the override is stored
- THEN an audit entry records actor, target, action, source, and override details

### Requirement: Tenant creation audit

Tenant creation with first admin MUST produce an audit entry, even when executed via service role script.

#### Scenario: Tenant creation script writes audit
- GIVEN a service role script creates a new tenant with admin user
- WHEN the script completes
- THEN an audit entry exists with source `script`, recording tenant creation
