# Apply Progress: Issue 21 Login Frontend

## Summary

- **Mode:** Standard (strict_tdd=false)
- **Change:** issue-21-login-frontend
- **Status:** Visual integration complete; static/runtime validation passed and maintainer approved single PR with `size:exception`.

## Completed Tasks

- [x] 1.1 Verify `getLoginFailureMessage` is exhaustive and add fallback for unknown/malformed codes.
- [x] 1.2 Add explicit test coverage for `missing_tenant` mapping in `login-model.test.ts`.
- [x] 1.3 Keep `buildLoginPayload` trimming behavior and empty-field validation assertions in sync.
- [x] 2.1 Change `apps/web/app/layout.tsx` `lang` from `en` to `es`.
- [x] 2.2 Re-verify public login entry scope in `apps/web/app/page.tsx`.
- [x] 2.3 Install `@react-bits/Ferrofluid-JS-CSS` and place generated `Ferrofluid` assets under `apps/web/components`.
- [x] 2.4 Update `apps/web/app/page.tsx` to render a split login card with a dedicated visual panel using `LoginVisual`.
- [x] 2.5 Extend `apps/web/app/globals.css` for stable ~600px visual height, responsive stack behavior, and reduced-motion fallbacks.
- [x] 3.1 Validate inline submit flow remains trimmed email, raw password, and inline status in `apps/web/app/login-form.tsx`.
- [x] 3.2 Verify no navigation APIs are present in `apps/web/app/login-form.tsx`.
- [x] 3.3 Keep `.login-feedback-region` permanently rendered to avoid layout shift.
- [x] 4.1 Run `pnpm test -- apps/web/app/login-model.test.ts`.
- [x] 4.2 Run quality checks (`pnpm --filter @faena360/web lint`, `pnpm --filter @faena360/web typecheck`, and `pnpm --filter @faena360/web build` with required env vars).
- [x] 4.3 Run static no-navigation scan with repo grep on layout/page/form files.
- [x] 4.4 Run focused frontend runtime tests for `/` render and login form behavior: `pnpm test -- apps/web/app/page.runtime.test.tsx apps/web/app/login-form.runtime.test.tsx`.
- [x] 4.5 Re-run quality checks after Ferrofluid install: `pnpm --filter @faena360/web lint`, `pnpm --filter @faena360/web typecheck`, and `pnpm --filter @faena360/web build`.
- [x] Added `apps/web/components/Ferrofluid.d.ts` and guarded `window.matchMedia` access in `apps/web/components/login-visual.tsx` to keep TS and tests stable.

## Verification Evidence

| Check | Command | Result |
|-------|---------|--------|
| Unit tests | `pnpm test -- apps/web/app/login-model.test.ts apps/web/app/page.runtime.test.tsx apps/web/app/login-form.runtime.test.tsx` | PASS (11 tests, all passing) |
| Unit/integration tests | `pnpm test -- apps/web/app/api/auth/login/route.test.ts apps/web/app/api/auth/me/route.test.ts apps/web/lib/auth/session.test.ts apps/web/app/login-model.test.ts apps/web/app/login-form.runtime.test.tsx apps/web/app/page.runtime.test.tsx` | PASS (45 tests, all passing) |
| Quality | `pnpm --filter @faena360/web lint` | PASS |
| Quality | `pnpm --filter @faena360/web typecheck` | PASS |
| Build | `pnpm --filter @faena360/web build` | Initially failed without env vars; PASS with required dummy env values |
| Navigation scan | `grep / regex useRouter|redirect\(|router\.push|window\.location|/dashboard|/protected` over `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/login-form.tsx` | PASS (no matches in implementation files) |
| Runtime checks | `pnpm test -- ... page.runtime.test.tsx` | PASS (3 tests, including no protected links check) |

## Issues / Fixes Made

- Added ambient type declaration for generated JS component to make `dpr` and `mixBlendMode` optional in TS imports.
- Added `window.matchMedia` guards in `apps/web/components/login-visual.tsx` because jsdom does not provide it by default.
- Added `varying vec2 vUv;` to the generated Ferrofluid vertex shader so `vUv = uv;` compiles in the browser.
- Updated `apps/web/tsconfig.json` to exclude `.next`, preventing stale/generated Next artifacts from breaking standalone package typecheck after build.

## Deviations

- `apps/web/components/login-visual.tsx` now wraps the generated Ferrofluid output for compatibility + motion-reduction toggling, but uses the same generated component and approved configuration values.

## Remaining Tasks

- [x] 4.6 Static/runtime smoke verification for visual split behavior, reduced-motion behavior, and inline success/error feedback stability. Manual browser smoke remains recommended before merge.
- [x] 4.7 Measured final changed lines before commit/PR. Maintainer approved single PR with `size:exception` after the Ferrofluid integration exceeded the 400-line budget.
