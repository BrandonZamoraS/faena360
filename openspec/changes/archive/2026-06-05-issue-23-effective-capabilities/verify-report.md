# Verification Report: Effective Capabilities Resolver

## Change

- Change: `issue-23-effective-capabilities`
- Base branch: `development`
- Worktree: `C:\Users\abran\AppData\Local\Temp\opencode\faena360-issue-23`
- Strict TDD: applied for this branch because Vitest exists on `development`

## TDD Evidence

| Step | Command | Result |
|------|---------|--------|
| RED | `pnpm test packages/application/src/auth/effective-capabilities.test.ts` | FAIL: missing `./effective-capabilities` module |
| GREEN | `pnpm test packages/application/src/auth/effective-capabilities.test.ts` | PASS: 9 tests |
| REFACTOR/Verify | formatted touched files, reran tests/typecheck/build | PASS with env-required note |

## Commands

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm test packages/application/src/auth/effective-capabilities.test.ts` | PASS | 9 issue #23 tests |
| `pnpm -r typecheck` | PASS | All workspace package typechecks |
| `pnpm --filter @faena360/web build` | FAIL expected | Missing required Supabase env vars |
| `$env:NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'; $env:NEXT_PUBLIC_SUPABASE_ANON_KEY='dummy-anon-key'; pnpm --filter @faena360/web build` | PASS | Build compiles with required env present |

## Spec Compliance Matrix

| Scenario | Status | Runtime Evidence |
|----------|--------|------------------|
| User without roles has no capabilities | COMPLIANT | Vitest empty-role test |
| Multiple roles are unioned without duplicates | COMPLIANT | Vitest role-union test |
| Deny override removes a role capability | COMPLIANT | Vitest deny override test |
| Deny override wins over allow override | COMPLIANT | Vitest allow+deny conflict test |
| Allow override adds a missing capability | COMPLIANT | Vitest allow override test |
| Cached result is reused until invalidated | COMPLIANT | Vitest cache/invalidation read-count test |
| Expired cached result is refreshed | COMPLIANT | Vitest TTL expiry test |
| Missing capability fails authorization | COMPLIANT | Vitest `capability_denied` test |
| Present capability passes authorization | COMPLIANT | Vitest success guard test |

## Issues

### Critical

- None.

### Warnings

- Concrete Supabase/session adapter integration remains deferred because those contracts are not present in this branch.
- Web build requires Supabase public env vars by design; build passes when they are provided.

## Verdict

PASS
