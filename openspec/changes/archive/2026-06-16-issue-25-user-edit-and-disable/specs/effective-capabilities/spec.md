# Delta for Effective Capabilities

## MODIFIED Requirements

### Requirement: Cache and Guard

The system SHOULD cache resolved capabilities by tenant and user for a short TTL. The system MUST invalidate the target user's cache when `updateUser` replaces roles via `replaceRoles`. The system MUST allow invalidation for capability/override changes and MUST provide a guard for required capabilities.
(Previously: invalidation was available via `invalidate()` but was never called from the user management update flow. After a role replacement in `updateUser`, the target user's capabilities stayed stale until the 30s TTL expired.)

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
