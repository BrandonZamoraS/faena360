# Design: Issue 21 Login Frontend

## Technical Approach

Keep `/` as a public Next.js App Router split login card: client `LoginForm` on one side, blue shadcn React Bits `Ferrofluid` visual on the other. The form uses `login-model.ts`, posts to existing `POST /api/auth/login`, and keeps success inline only: no redirect, dashboard, middleware guard, or protected route. Before apply, install `pnpm dlx shadcn@latest add @react-bits/Ferrofluid-JS-CSS` and adapt the generated file without changing auth behavior.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Entry route | Use `apps/web/app/page.tsx` and colocated `LoginForm`. | Add `/login` route or dashboard redirect. | Spec requires root entry and no post-login destination. |
| Form model | Keep `buildLoginPayload`, `isValidLoginInput`, and `getLoginFailureMessage` as pure helpers in `login-model.ts`. | Inline rules in React state handlers. | Pure helpers are testable with Vitest and keep the client component small. |
| Backend contract | Call `/api/auth/login` with `{ email, password }`; trim email only. | Add endpoint/backend change. | Existing handler owns session cookie and known codes. |
| Feedback | Render one inline status at a time: validation/error or success. | Toasts, modal, redirect, or protected page. | Inline state is accessible, scoped, and avoids inventing navigation. |
| Visual motion | Use React Bits Ferrofluid only in the blue visual panel, with reduced-motion fallback and no motion dependency for form comprehension. | Custom canvas/SVG effect or page-load choreography. | The requirement explicitly approves Ferrofluid; isolating it preserves product-task clarity. |

## Data Flow

```text
User input ──→ LoginForm state ──→ login-model helpers
                                  │
                                  ├─ invalid: inline Spanish error, no request
                                  │
                                  └─ valid: fetch POST /api/auth/login
                                              │
                      ok:true + Set-Cookie ───┴──→ inline success, stay on /
                      ok:false code ─────────────→ Spanish mapped error
```

Visual flow is independent: `page.tsx` imports generated `Ferrofluid` and passes the approved palette/config (`#4F46E5`, `#06B6D4`, `#E0F2FE`, speed `0.5`, scale `1.6`, mouse interaction). On submit, clear previous feedback before validating so later failures replace earlier success. Unknown backend codes fall back to generic retry copy.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/app/page.tsx` | Modify | Public Spanish split login shell. |
| `apps/web/app/login-form.tsx` | Modify | Client form state, submit handling, disabled/loading state, inline messages. |
| `apps/web/components/Ferrofluid.tsx` or generated path | Create | shadcn React Bits Ferrofluid component, imported by the visual panel. |
| `apps/web/app/login-model.ts` | Modify | Payload normalization, validation, auth-code copy map. |
| `apps/web/app/login-model.test.ts` | Modify | TDD coverage for helper contracts and all known codes, including `missing_tenant`. |
| `apps/web/app/layout.tsx` | Modify | Spanish title/description and `html lang="es"`. |
| `apps/web/app/globals.css` | Modify | Split layout, 600px desktop visual panel, reserved feedback, focus states, reduced motion. |
| `apps/web/package.json`, lockfile | Modify | Dependencies added by shadcn/React Bits if generated component requires them. |

## Interfaces / Contracts

```ts
type LoginResponse =
  | { ok: true; session: { email: string; tenant_id: string; roles: string[] } }
  | { ok: false; code: LoginFailureCode };
```

Known frontend messages must cover: `invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user`, `web_access_denied`. The request body must be JSON with trimmed `email` and exact `password`.

`Ferrofluid` props follow the provided reference: blue/cyan/ice colors, `flowDirection="down"`, `opacity={1}`, `mouseInteraction`, white `color1/2/3`, restrained speed.

## Accessibility and Locale

- Use semantic `<main>`, labeled controls, `type="email"`, `type="password"`, and autocomplete tokens.
- Use inline message containers; keep `role="status"`/`aria-live="polite"` for status changes.
- Spanish visible UI, metadata title/description, and document language must be aligned with `lang="es"`.
- Maintain contrast for body, placeholder, error, success, focus ring, and disabled states.
- Reserve feedback region height so validation/error/success messages do not shift the form layout.
- Gate or replace continuous ferrofluid motion under `prefers-reduced-motion: reduce`; hover/mouse effects apply only where pointer interaction is appropriate.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `login-model.ts` trimming, validation, every known code | `pnpm test -- apps/web/app/login-model.test.ts`. |
| Integration | API contract and visual import remain compatible | Existing route tests cover `/api/auth/login`; add no backend behavior. Confirm generated Ferrofluid imports compile in Next.js. |
| Quality | Type/lint/build confidence | Verify with `pnpm lint`, `pnpm -r typecheck`, and `pnpm build` when env allows. Do not run Supabase CLI. |
| E2E | Manual browser smoke | Confirm `/` renders split card/Ferrofluid, labels, reserved feedback, empty-submit blocking, inline success, and no navigation. |

## Migration / Rollout

No migration required. Rollback is reverting the login-entry file set from the proposal.

## Open Questions

None.
