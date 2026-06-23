# Archive Report: Issue #68 WhatsApp inbound identity

## Status

Archived lightweight closure for `issue-68-whatsapp-identify` on 2026-06-23. No full OpenSpec spec sync was performed.

## Executive Summary

Faena360 now exposes a Next.js Route Handler for n8n to identify an inbound WhatsApp operative by normalized phone, validate webhook HMAC/timestamp, enforce active tenant/user plus WhatsApp channel capability gates, and return identity context without persisting WhatsApp sessions, incomplete flows, or operational records.

## Artifact References

| Artifact | Location |
|---|---|
| Molecular spec / plan | `openspec/changes/archive/2026-06-23-issue-68-whatsapp-identify/plan.md` |
| Design | `openspec/changes/archive/2026-06-23-issue-68-whatsapp-identify/design.md` |
| Apply progress | Engram `sdd/issue-68-whatsapp-identify/apply-progress` |
| Verify report | Engram `sdd/issue-68-whatsapp-identify/verify-report` |
| PR | https://github.com/BrandonZamoraS/faena360/pull/77 |

## Verification Evidence

- `pnpm test -- apps/web/lib/webhooks/hmac.test.ts apps/web/app/api/webhooks/whatsapp/identify/route.test.ts` passed: 2 files, 16 tests.
- Earlier focused suite passed for HMAC, route, application identify, infrastructure repository, and default-role-bootstrap tests.
- `pnpm -r typecheck` passed.
- `pnpm lint` passed.
- `pnpm -r build` passed.
- Local SQL verification passed with `pnpm exec supabase db reset` and `psql ... -f supabase/tests/whatsapp_channel_access.sql`.
- SQL evidence covered normalized lookup, service-role-only RPC access, operative-only grants, non-operative system cleanup, custom grant preservation, and no WhatsApp persistence tables.
- GitHub checks passed on PR #77: Vercel Preview Comments, Lint/Format/Typecheck/Build.
- Codex review comments were addressed, threads resolved, and Codex was requested again after the latest fix.

## Follow-ups

- Unrelated: `supabase/tests/authorization_constraints.sql` is stale because `user_profiles.full_name` is now `NOT NULL`.
- n8n manual signed end-to-end request remains outside this repo archive scope.

## Risks

- Replay protection remains timestamp freshness-only by design because identify is read-only.
- Capability gate is intentionally `whatsapp.channel.access`; future WhatsApp actions still need action-specific capability checks.
- Latest Codex re-review was requested after the final fix; this archive records the request and resolved prior threads, not a new Codex verdict beyond the passed GitHub checks listed above.
