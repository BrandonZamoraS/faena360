# Infraestructura Base Specification

## Purpose

Define the minimum platform foundation Faena360 MUST provide before business features: repository structure, public web bootstrap, tenant foundation data, tenant-aware storage, environment-safe delivery, and technical health monitoring.

## Requirements

### Requirement: Repository foundation

The system MUST provide a modular repository structure that separates web application code, shared/domain layers, and Supabase infrastructure assets.

#### Scenario: Agreed base structure exists
- GIVEN the base project is initialized
- WHEN the repository is reviewed
- THEN the web app, shared/domain packages, and Supabase assets are present as separate top-level work areas

### Requirement: Public bootstrap availability

The system MUST expose a publicly reachable web entry point that returns HTTP 200 and clearly states the product is not yet operational.

#### Scenario: Placeholder is reachable
- GIVEN a deployed environment
- WHEN a user opens the public URL
- THEN the response is successful and the page communicates placeholder status without simulating business behavior

### Requirement: Tenant foundation data

The system MUST provision a `tenants` data store with the minimum identity and operating fields needed for later tenant-scoped modules. Tenant timestamps MUST use UTC-compatible `timestamptz` semantics.

#### Scenario: Minimum tenant schema is available
- GIVEN the initial database migration has run
- WHEN the tenant foundation is inspected
- THEN the store includes identifier, name, slug, timezone, currency, status, created timestamp, and updated timestamp fields

#### Scenario: MVP avoids premature commercial data
- GIVEN the initial tenant schema
- WHEN the columns are reviewed
- THEN fiscal or commercial company data is not required in this phase

### Requirement: Tenant isolation for storage and access

The system MUST enforce tenant isolation in backend-controlled data and file access. A user MUST belong to only one tenant in the MVP, the active `tenant_id` MUST be available for backend enforcement, and storage access MUST use tenant-aware paths through a provider-agnostic application port.

#### Scenario: Tenant-scoped storage access
- GIVEN a file operation for tenant-owned content
- WHEN the backend prepares the access request
- THEN the storage target is resolved under a tenant-aware path and business rules do not depend directly on a vendor SDK

#### Scenario: Critical validation is not delegated away
- GIVEN a protected data or storage operation
- WHEN authorization is evaluated
- THEN tenant enforcement is performed by backend-controlled rules and not only by UI, AI, or workflow tooling

### Requirement: Environment-safe delivery

The system MUST support separate `development`, `stage`, and `production` environments. The build or deployment process MUST fail explicitly when critical configuration is missing. Pull requests MUST run lint and build validation before merge consideration, and stage/production deployments MUST follow their designated release branches.

#### Scenario: Missing critical configuration blocks delivery
- GIVEN a build or deployment with missing required variables
- WHEN the pipeline starts validation
- THEN the process fails with an explicit configuration error before release

### Requirement: Technical health visibility

The system MUST expose `GET /api/health` with technical status only, without secrets. The endpoint MUST report application reachability, basic Supabase/Postgres connectivity, and build version or deployment timestamp. Monitoring SHOULD poll this endpoint every two minutes and alert on request failure or unhealthy state.

#### Scenario: Health endpoint reports minimum technical signals
- GIVEN the platform is deployed
- WHEN `/api/health` is requested
- THEN the response includes technical status for app reachability, platform connectivity, and build or deploy identity without exposing secrets

#### Scenario: Monitoring detects unhealthy platform state
- GIVEN automated monitoring is active
- WHEN the health request fails or reports unhealthy
- THEN an operational alert is emitted for follow-up
