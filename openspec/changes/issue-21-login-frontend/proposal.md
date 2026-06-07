# Proposal: Issue 21 Login Frontend

## Intent

Deliver the minimum public web entry for issue #21 so authorized users can submit credentials against the existing auth API and receive immediate feedback without inventing post-login navigation.

## Scope

### In Scope
- Public start/login screen at the web root.
- Client form wired to `POST /api/auth/login` with trimmed credentials.
- In-place success state plus backend-code-specific error copy.
- Split login card visual treatment using the React Bits Ferrofluid component in the blue/visual section.
- Responsive, accessible shell aligned with Spanish UI metadata.

### Out of Scope
- New dashboard, protected landing page, or redirect after login.
- Backend auth/domain changes unless a frontend blocker is uncovered.

## Capabilities

### New Capabilities
- `web-login-entry`: Public login screen, API submission, error mapping, and in-place success confirmation for web access.

### Modified Capabilities
- None.

## Approach

Keep the root page as the login entry, reuse the existing `/api/auth/login` contract from PR #39, preserve server-owned session handling, and limit frontend work to form UX, copy mapping, document-language alignment, and minimal styling/tests.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/page.tsx` | Modified | Public login/start shell |
| `apps/web/app/login-form.tsx` | Modified | Submit form, success/error states |
| `apps/web/components/Ferrofluid.tsx` | Added | shadcn React Bits Ferrofluid visual component |
| `apps/web/app/login-model.ts` | Modified | Input trimming and auth-code mapping |
| `apps/web/app/login-model.test.ts` | Modified | UI model contract coverage |
| `apps/web/app/layout.tsx` | Modified | Spanish metadata/lang alignment |
| `apps/web/app/globals.css` | Modified | Responsive and reduced-motion styling |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Success feels incomplete without destination route | Med | Explicitly confirm login in place and defer navigation to the follow-up issue |
| Backend/frontend code mismatch on auth failures | Low | Keep frontend mapping restricted to known backend codes from `/api/auth/login` |

## Rollback Plan

Revert the login-entry file set (`page.tsx`, `login-form.tsx`, `login-model.ts`, `login-model.test.ts`, `layout.tsx`, `globals.css`) to restore the prior placeholder root page and remove the new frontend login surface.

## Dependencies

- Existing `POST /api/auth/login` endpoint and signed session cookie flow from PR #39.
- React Bits Ferrofluid component installed with `pnpm dlx shadcn@latest add @react-bits/Ferrofluid-JS-CSS`.

## Success Criteria

- [ ] Users can submit email/password from `/` and receive inline success confirmation without redirect.
- [ ] Known backend auth failure codes render the expected Spanish messages.
- [ ] The login visual section uses Ferrofluid with the required blue/cyan liquid-glass motion and preserves reduced-motion accessibility.
- [ ] Root login screen stays accessible, responsive, and consistent with project metadata constraints.
