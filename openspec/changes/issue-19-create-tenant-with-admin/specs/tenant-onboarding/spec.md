# Tenant Onboarding Specification

## Purpose

Define the operator workflow that bootstraps one tenant and its first administrator without ad-hoc Auth, SQL, or Studio steps.

## Requirements

### Requirement: Validated onboarding request

The system MUST accept one onboarding request with tenant name, unique slug, timezone, currency, fuel unit, admin email, temporary password, and minimum local profile data. The system MUST reject the request before persistence when required data is missing, duplicated, or violates documented tenant/profile constraints.

#### Scenario: Valid onboarding request is accepted
- GIVEN an operator provides all required tenant and admin inputs in valid formats
- WHEN onboarding starts
- THEN the request passes validation and may continue to bootstrap resources

#### Scenario: Invalid onboarding request is rejected early
- GIVEN the request has a duplicate slug or email, or invalid timezone, currency, or fuel unit
- WHEN onboarding starts
- THEN no tenant, Auth user, profile, role, or assignment is persisted

### Requirement: Tenant and first admin bootstrap

The system MUST create exactly one tenant, one platform identity, one tenant-bound local user profile, the default tenant role set, and one administrator assignment for the first admin as a single onboarding outcome.

#### Scenario: Tenant and first admin are bootstrapped
- GIVEN a validated onboarding request
- WHEN the operator runs the workflow successfully
- THEN the tenant, Auth identity, local profile, default roles, and first admin assignment all exist for the same tenant

#### Scenario: First admin stays tenant-bound
- GIVEN a successfully bootstrapped tenant
- WHEN the first admin profile and assignment are reviewed
- THEN the local profile and administrator assignment reference only that tenant

### Requirement: Default authorization bootstrap follows documented source

The system MUST bootstrap the documented default roles `administrador`, `supervisor`, `operador`, `mantenimiento`, and `repartidor_de_combustible`. All five roles MUST be system roles. `administrador` and `supervisor` MUST allow web access; the other three MUST NOT require web access. Capability grants MUST come from the project's documented default role-capability source, and the system MUST NOT invent undocumented grants.

#### Scenario: Documented default roles are created
- GIVEN a validated onboarding request and an authoritative default bootstrap source
- WHEN onboarding completes
- THEN the five documented default roles exist for the new tenant and the first admin has the `administrador` role

#### Scenario: Missing capability mapping blocks onboarding safely
- GIVEN the documented role-capability source is missing or incomplete for bootstrap
- WHEN onboarding starts
- THEN the workflow stops without persisting onboarding resources and reports the missing mapping as a blocking error

### Requirement: Safe failure and rerun behavior

The system MUST compensate any failed onboarding so no partial tenant bootstrap remains. The system MUST also reject reruns that would duplicate an existing tenant slug or existing admin identity instead of creating conflicting records.

#### Scenario: Failure rolls back created resources
- GIVEN onboarding created some resources and a later bootstrap step fails
- WHEN the workflow handles the failure
- THEN created Auth and tenant authorization resources from that run are removed or reverted

#### Scenario: Duplicate rerun does not create conflicting records
- GIVEN a tenant slug or admin identity already exists from a prior run
- WHEN the same onboarding request is submitted again
- THEN the workflow fails clearly and leaves existing records unchanged
