# Authorization Base Specification

## Purpose

Define the minimum authorization persistence Faena360 MUST provide for tenant-bound roles, effective capabilities, local user profiles, and minimal audit history.

## Requirements

### Requirement: Local user profiles

The system MUST persist local user profiles linked to a tenant and a platform identity. Email and phone identifiers MUST be globally unique when present.

#### Scenario: Profile is stored for a tenant user
- GIVEN a valid platform user and tenant
- WHEN a local profile is created
- THEN the profile is linked to exactly one tenant and one platform identity

#### Scenario: Duplicate contact data is rejected
- GIVEN an existing profile with the same email or phone
- WHEN another profile uses that same global identifier
- THEN the write is rejected by the data store

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

### Requirement: Minimal authorization audit history

The system MUST persist minimal audit records for authorization changes with actor, target, action, and event timestamp data. The system MUST NOT require richer audit detail fields beyond this MVP scope.

#### Scenario: Authorization change creates a minimal audit record
- GIVEN a role, assignment, or override change
- WHEN the change is stored
- THEN a minimal audit record can capture who acted, what changed, and when

#### Scenario: MVP audit scope stays minimal
- GIVEN the authorization base schema is reviewed
- WHEN audit requirements are validated
- THEN richer vault-only audit columns are not required in this phase

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
