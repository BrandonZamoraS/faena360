# Delta for Authorization Base

## MODIFIED Requirements

### Requirement: Local user profiles

The system MUST persist local user profiles linked to a tenant and a platform identity. Email and phone identifiers MUST be globally unique when present. Tenant-scoped application access MUST be limited by RLS to rows whose tenant matches the current app tenant, and application actors MUST NOT physically delete `user_profiles` rows.
(Previously: profiles were tenant-linked and unique, but no tenant-aware RLS or explicit hard-delete prohibition was required.)

#### Scenario: Profile is stored for a tenant user
- GIVEN a valid platform user and tenant
- WHEN a local profile is created
- THEN the profile is linked to exactly one tenant and one platform identity

#### Scenario: Duplicate contact data is rejected
- GIVEN an existing profile with the same email or phone
- WHEN another profile uses that same global identifier
- THEN the write is rejected by the data store

#### Scenario: Cross-tenant profile access is denied
- GIVEN an app session for tenant A and a profile owned by tenant B
- WHEN the session selects, updates, or deletes that profile
- THEN RLS denies the operation

### Requirement: Tenant roles and assignments

The system MUST persist role definitions per tenant and MUST prevent duplicate role names or duplicate user-role assignments within the same tenant. Tenant-scoped application access to roles and assignments MUST be limited by RLS to data owned by or joined from the current app tenant.
(Previously: roles and assignments were tenant-scoped by data model, but no tenant-aware RLS was required.)

#### Scenario: Tenant role catalog stays isolated
- GIVEN two different tenants
- WHEN each tenant defines a role with the same name
- THEN each role is stored only within its own tenant scope

#### Scenario: Duplicate assignment is blocked
- GIVEN a user already assigned to a tenant role
- WHEN the same assignment is created again
- THEN the write is rejected by the data store

#### Scenario: Cross-tenant role access is denied
- GIVEN an app session for tenant A and a role or assignment belonging to tenant B
- WHEN the session reads or mutates that data
- THEN RLS denies the operation

### Requirement: Effective capability persistence

The system MUST persist a global capability catalog, role-to-capability grants, and per-user capability overrides so effective access can be derived without duplicating capability definitions per tenant. Per-user capability overrides MUST include `tenant_id`, and tenant-scoped application access to grants and overrides MUST be limited by RLS to data owned by or joined from the current app tenant.
(Previously: shared capabilities and overrides were required, but tenant-aware RLS and tenant_id on overrides were not.)

#### Scenario: Role grants reference shared capabilities
- GIVEN a capability catalog entry and a tenant role
- WHEN the role receives a capability grant
- THEN the grant references the shared capability and the tenant role

#### Scenario: User override can differ from role grants
- GIVEN a user with role-based capabilities
- WHEN a user-specific override is stored
- THEN the override is persisted separately from the role grants

#### Scenario: Cross-tenant grants and overrides stay hidden
- GIVEN an app session for tenant A and grants or overrides for tenant B
- WHEN the session reads or mutates that data
- THEN RLS denies the operation

### Requirement: Minimal authorization audit history

The system MUST persist minimal audit records for authorization changes with tenant, actor, target, action, and event timestamp data. Each audit record MUST include `tenant_id`, and tenant-scoped application access to audit records MUST be limited by RLS to rows whose tenant matches the current app tenant even when actor or target references are `NULL`. The system MUST NOT require richer audit detail fields beyond this MVP scope.
(Previously: audit records required actor, target, action, and timestamp, but tenant_id and null-safe tenant isolation were not required.)

#### Scenario: Authorization change creates a minimal audit record
- GIVEN a role, assignment, or override change
- WHEN the change is stored
- THEN a minimal audit record can capture tenant, who acted, what changed, and when

#### Scenario: MVP audit scope stays minimal
- GIVEN the authorization base schema is reviewed
- WHEN audit requirements are validated
- THEN richer vault-only audit columns are not required in this phase

#### Scenario: Null actor or target does not break tenant isolation
- GIVEN an audit row for tenant B with a NULL actor or target reference
- WHEN a tenant A session queries audit history
- THEN RLS still denies access to that row
