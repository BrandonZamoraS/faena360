# Authorization Base Specification

## Purpose

Define the minimum authorization persistence Faena360 MUST provide for tenant-bound roles, effective capabilities, local user profiles, and audit history.

## Requirements

### Requirement: Local user profiles

The system MUST persist local user profiles linked to a tenant and a platform identity. Email and phone identifiers MUST be globally unique when present, enforced on BOTH create and update paths. When updating a user's phone, the system MUST check the new phone against all OTHER users and MUST allow the same user to keep their existing phone. The `updateUser` use case MUST return `duplicate_identifier` when the updated phone belongs to a different user.

#### Scenario: Profile is stored for a tenant user
- GIVEN a valid platform user and tenant
- WHEN a local profile is created
- THEN the profile is linked to exactly one tenant and one platform identity

#### Scenario: Duplicate contact data is rejected
- GIVEN an existing profile with the same email or phone
- WHEN another profile uses that same global identifier
- THEN the write is rejected by the data store

#### Scenario: Duplicate phone on update is rejected
- GIVEN user A has phone "11234567890" and user B has phone "999"
- WHEN user B's profile is updated to use phone "11234567890"
- THEN `updateUser` returns `{ ok: false, code: "duplicate_identifier" }`

#### Scenario: Same-phone update is allowed (self-exclusion)
- GIVEN user A has phone "11234567890"
- WHEN user A's profile is updated with the same phone "11234567890" and a new fullName
- THEN the update succeeds, profile changes are persisted, and audit is recorded

### Requirement: Tenant roles and assignments

The system MUST persist role definitions per tenant and MUST prevent duplicate role names or duplicate user-role assignments within the same tenant.

#### Scenario: Tenant role catalog stays isolated
- GIVEN two different tenants
- WHEN each tenant defines a role with the same name
- THEN each role is stored only within its own tenant scope

#### Scenario: Duplicate assignment is blocked
- GIVEN a user already assigned to a tenant role
- WHEN the same assignment is created again
- THEN the write is rejected by the data store

### Requirement: Effective capability persistence

The system MUST persist a global capability catalog, role-to-capability grants, and per-user capability overrides so effective access can be derived without duplicating capability definitions per tenant.

#### Scenario: Role grants reference shared capabilities
- GIVEN a capability catalog entry and a tenant role
- WHEN the role receives a capability grant
- THEN the grant references the shared capability and the tenant role

#### Scenario: User override can differ from role grants
- GIVEN a user with role-based capabilities
- WHEN a user-specific override is stored
- THEN the override is persisted separately from the role grants

### Requirement: Authorization audit history

The system MUST persist audit records for authorization changes with actor, target, action, and event timestamp data. Authorization audit behavior is delegated to the `audit-log-system` capability, which provides source tracing, before/after JSONB diffs, and sensitive field sanitization.

(Previously: Required minimal audit records and explicitly disallowed richer detail fields beyond MVP scope.)

#### Scenario: Authorization change creates a minimal audit record
- GIVEN a role, assignment, or override change
- WHEN the change is stored
- THEN a minimal audit record can capture who acted, what changed, and when

#### Scenario: Authorization audit uses full audit-log-system
- GIVEN the audit-log-system capability is active
- WHEN an authorization mutation is audited
- THEN source, old_value, and new_value JSONB diffs are captured per audit-log-system spec

#### Scenario: Sensitive authorization changes are audited
- GIVEN a supervisor modifies role permissions or creates capability overrides
- WHEN the change is stored
- THEN an audit entry records the actor, target, source, and mutation details per audit-log-system

### Requirement: Authorization schema integrity

The system MUST apply from a clean reset without errors and MUST enforce the defined uniqueness, foreign-key, and cascade rules for authorization persistence.

#### Scenario: Clean reset applies authorization schema
- GIVEN an empty environment reset
- WHEN the authorization schema is applied
- THEN the schema completes without migration errors

#### Scenario: Foreign key lifecycle stays consistent
- GIVEN related authorization records exist
- WHEN a referenced parent record is removed
- THEN the configured foreign-key or cascade behavior is enforced by the data store
