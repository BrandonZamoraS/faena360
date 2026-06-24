# Delta for infraestructura-base

## MODIFIED Requirements

### Requirement: Tenant foundation data

The system MUST provision a `tenants` data store with the minimum identity and operating fields needed for later tenant-scoped modules. Tenant timestamps MUST use UTC-compatible `timestamptz` semantics. The tenant foundation MUST include `fuel_unit` in addition to identifier, name, slug, timezone, currency, and status.

(Previously: Tenant foundation required identifier, name, slug, timezone, currency, status, created_at, and updated_at, but not `fuel_unit`.)

#### Scenario: Minimum tenant schema is available
- GIVEN the initial database migration has run
- WHEN the tenant foundation is inspected
- THEN the store includes identifier, name, slug, timezone, currency, fuel_unit, status, created timestamp, and updated timestamp fields

#### Scenario: MVP avoids premature commercial data
- GIVEN the initial tenant schema
- WHEN the columns are reviewed
- THEN fiscal or commercial company data is not required in this phase

#### Scenario: Operating unit data is part of tenant base
- GIVEN the tenant foundation schema
- WHEN tenant operating fields are reviewed
- THEN `fuel_unit` is required as base tenant data without expanding into unrelated configuration tables
