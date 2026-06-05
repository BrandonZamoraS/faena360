# Tasks: Effective Capabilities Resolver

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300-400 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR from `development` |
| Delivery strategy | single-pr-default |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: RED Tests

- [x] 1.1 Add Vitest scenarios in `packages/application/src/auth/effective-capabilities.test.ts`.
- [x] 1.2 Run the test and confirm RED failure from missing module.

## Phase 2: Domain and Application

- [x] 2.1 Add `packages/domain/src/auth` capability types and exports.
- [x] 2.2 Add resolver repository/cache ports and `getEffectiveCapabilities`.
- [x] 2.3 Add in-memory TTL cache and invalidation.
- [x] 2.4 Add `requireCapability` and `CapabilityDeniedError`.

## Phase 3: Wiring and Verification

- [x] 3.1 Export auth APIs from package barrels and add domain dependency.
- [x] 3.2 Run GREEN tests for issue #23.
- [x] 3.3 Run full typecheck/build verification.
