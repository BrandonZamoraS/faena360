# Effective Capabilities Specification

## Purpose

Define tenant-scoped ABAC capability resolution for application authorization.

## Requirements

### Requirement: Effective Capability Resolution

The system MUST resolve a user's effective capabilities for a tenant by combining assigned roles, role capabilities, and user capability overrides. If no role or allow override grants a capability, the system MUST deny it by default.

#### Scenario: User without roles has no capabilities

- GIVEN a tenant user has no assigned roles
- WHEN effective capabilities are resolved
- THEN the result is an empty set

#### Scenario: Multiple roles are unioned without duplicates

- GIVEN a tenant user has multiple roles with overlapping capabilities
- WHEN effective capabilities are resolved
- THEN each granted capability appears only once

#### Scenario: Deny override removes a role capability

- GIVEN a role grants a capability
- AND the user has a `deny` override for that capability
- WHEN effective capabilities are resolved
- THEN the denied capability is absent

#### Scenario: Deny override wins over allow override

- GIVEN a user has both `allow` and `deny` overrides for the same capability
- WHEN effective capabilities are resolved
- THEN the denied capability is absent

#### Scenario: Allow override adds a missing capability

- GIVEN no role grants a capability
- AND the user has an `allow` override for that capability
- WHEN effective capabilities are resolved
- THEN the allowed capability is present

### Requirement: Cache and Guard

The system SHOULD cache resolved capabilities by tenant and user for a short TTL. The system MUST invalidate the target user's cache when `updateUser` replaces roles via `replaceRoles`. The system MUST allow invalidation for role/capability/override changes and MUST provide a guard for required capabilities.

#### Scenario: Cached result is reused until invalidated

- GIVEN a cached tenant/user capability result
- WHEN capabilities are resolved again before invalidation
- THEN repository reads are not repeated

#### Scenario: Expired cached result is refreshed

- GIVEN a cached tenant/user capability result has exceeded its TTL
- WHEN capabilities are resolved again
- THEN fresh repository data is read

#### Scenario: Cache invalidated after role change in updateUser

- GIVEN a user's capabilities are cached (e.g. from a recent login)
- AND an admin calls `updateUser` with a new `roleIds` list for that user
- WHEN the same user's capabilities are resolved next
- THEN the cache MISSES and fresh capabilities are computed from the repository

#### Scenario: Missing capability fails authorization

- GIVEN a user lacks the required capability
- WHEN `requireCapability` runs
- THEN it fails with `capability_denied`

#### Scenario: Present capability passes authorization

- GIVEN a user has the required capability
- WHEN `requireCapability` runs
- THEN it returns the resolved capability set
