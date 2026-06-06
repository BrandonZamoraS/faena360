# Tenant-Aware Users Specification

## Purpose

Define tenant-scoped user creation and active-user listing for Faena360 without allowing cross-tenant access or partial cross-system persistence.

## Requirements

### Requirement: Canonical authorization for tenant-aware users

The system MUST authorize tenant-aware user management with the canonical capability keys `users:create` for creation and `users:read` for listing. The effective tenant MUST be resolved from the authenticated session, and the operation MUST be rejected when the actor lacks the required capability or tenant context.

#### Scenario: Authorized actor manages users in own tenant
- GIVEN an authenticated actor with an effective tenant and `users:create` or `users:read`
- WHEN the actor creates or lists users
- THEN the operation is evaluated against the actor's effective tenant only

#### Scenario: Unauthorized or tenantless actor is rejected
- GIVEN an authenticated actor without the required capability or without an effective tenant
- WHEN the actor creates or lists users
- THEN the system rejects the request before any user data is returned or written

### Requirement: Tenant-scoped user creation

The system MUST create tenant users only inside the actor's effective tenant. Before creation, the system MUST normalize email and phone values and enforce global uniqueness for each provided identifier. The Auth identity MUST be created with `app_metadata.tenant_id` equal to the effective tenant before local profile and role records are persisted.

#### Scenario: Create user inside effective tenant
- GIVEN an authorized actor with `users:create` and valid user data
- WHEN the actor creates a user
- THEN the new Auth identity and local records are associated to the actor's effective tenant

#### Scenario: Duplicate identifier blocks creation
- GIVEN an authorized actor and a normalized email or phone already used by another user
- WHEN the actor creates a user
- THEN the system rejects the request and does not create Auth or local records

### Requirement: Compensation and audit for creation flow

The system MUST treat Auth creation and local persistence as a compensating workflow. If Auth creation succeeds and any later local step fails, the system MUST remove the Auth user created by this flow. On successful creation, the system MUST record a user-creation audit event using the current audit contract; richer audit expansion remains out of scope for this capability.

#### Scenario: Local failure triggers compensation
- GIVEN Auth user creation succeeded for a new tenant user
- WHEN local profile, role, or related persistence fails afterward
- THEN the system compensates by removing the Auth user created by this flow

#### Scenario: Successful creation is audited
- GIVEN a tenant user is created successfully
- WHEN the workflow finishes
- THEN the system records a creation audit event for that tenant-scoped action

### Requirement: Active-only tenant user listing

The system MUST list only active users from the actor's effective tenant by default. The listing MUST exclude users from other tenants and MUST NOT return inactive users unless a future capability explicitly changes this behavior.

#### Scenario: Listing returns only active users from same tenant
- GIVEN an authorized actor with `users:read`
- WHEN the actor lists users
- THEN the response contains only active users belonging to the actor's effective tenant

#### Scenario: Cross-tenant users are never exposed
- GIVEN users exist in multiple tenants
- WHEN an authorized actor lists users
- THEN no user outside the actor's effective tenant is returned
