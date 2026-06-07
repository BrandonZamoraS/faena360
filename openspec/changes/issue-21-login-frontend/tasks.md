# Tasks: Issue 21 Login Frontend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260–420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR with maintainer-approved `size:exception` |
| Delivery strategy | ask-always |
| Chain strategy | not applicable |

Decision needed before apply: Resolved, maintainer approved single PR with `size:exception`
Chained PRs recommended: No
Chain strategy: not applicable
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Complete login entry alignment and Ferrofluid visual panel without adding navigation | PR 1 | Single PR remains acceptable if final changed-line count stays under the 400-line guard |

## Phase 1: Foundation / Model Alignment

- [x] 1.1 Verify `apps/web/app/login-model.ts` keeps `getLoginFailureMessage` exhaustive for all required codes (`invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user`, `web_access_denied`) and add an explicit fallback for unknown/malformed backend codes.
- [x] 1.2 Add a dedicated `apps/web/app/login-model.test.ts` assertion for `missing_tenant` message mapping: returns "No encontramos una empresa asociada a este usuario.".
- [x] 1.3 Ensure unit tests still assert `buildLoginPayload` trims email only and `isValidLoginInput` blocks empty credentials, then adjust expected behavior if drift is found.

## Phase 2: Public Login Surface

- [x] 2.1 Change `apps/web/app/layout.tsx` from `lang="en"` to `lang="es"` and confirm `metadata.title` / `metadata.description` remain Spanish aligned.
- [x] 2.2 Re-verify `apps/web/app/page.tsx` keeps `/` as the public login entry with form-only action and no links/routes that introduce `/dashboard`, `/protected`, or other authenticated destinations.
- [x] 2.3 Install the shadcn React Bits Ferrofluid component with `pnpm dlx shadcn@latest add @react-bits/Ferrofluid-JS-CSS` and keep generated files in the web app/component conventions.
- [x] 2.4 Update `apps/web/app/page.tsx` to render a split login card where the blue visual section contains `Ferrofluid` with the approved color/config reference and the form remains on the same public root page.
- [x] 2.5 Update `apps/web/app/globals.css` so the visual panel has stable desktop height around 600px, stacks responsively on small screens, and disables/replaces continuous ferrofluid motion for `prefers-reduced-motion: reduce`.

## Phase 3: Form Flow Consistency

- [x] 3.1 Validate `apps/web/app/login-form.tsx` submission behavior: trimmed email + raw password payload, prevent empty submit, and keep success/error rendering inline on the same page.
- [x] 3.2 Confirm `apps/web/app/login-form.tsx` has no navigation side effects introduced (no `useRouter`, `redirect`, or `router.push` usage in this flow).
- [x] 3.3 Preserve the reserved `.login-feedback-region` space so validation, backend error, and success messages do not cause layout shift.

## Phase 4: Testing and Verification

- [x] 4.1 Run unit test: `pnpm test -- apps/web/app/login-model.test.ts` and verify `missing_tenant` case passes.
- [x] 4.2 Run quality checks: `pnpm lint`, `pnpm -r typecheck`, and `pnpm build`.
- [x] 4.3 Run static no-navigation verification: `rg -n "useRouter|redirect\\(|router\\.push|window\\.location|/dashboard|/protected" apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/app/login-form.tsx` and confirm zero matches outside intentional non-login references.
- [x] 4.4 Manual smoke check `/` to confirm successful login shows inline confirmation and page remains `/` without introducing a protected route.
- [x] 4.5 Re-run quality checks after installing Ferrofluid: `pnpm lint`, `pnpm -r typecheck`, and `pnpm build`.
- [x] 4.6 Static/runtime smoke verification for `/`: split-card visual is rendered through `LoginVisual`, reduced-motion pauses Ferrofluid via `paused`, feedback space is reserved at `6rem`, and runtime tests keep successful login inline without navigation. Manual browser smoke remains recommended before merge, but is not required for this apply batch.
- [x] 4.7 Measure final changed lines before commit/PR. Final change exceeds the 400-line budget due generated Ferrofluid and lockfile changes; maintainer approved single PR with `size:exception`.
