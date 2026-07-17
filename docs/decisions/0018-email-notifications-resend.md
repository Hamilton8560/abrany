---
id: 0018
title: Email notifications via Resend (summit-labs.io) — team sign-up, certificates, weekly reports
status: proposed
owner: claude
date: 2026-07-17
---

## Context

David asked what happens when he signs someone up to his team today: nothing — no
email is sent, so a new teammate has no way to know an account exists or how to
log in. He asked for Resend (`summit-labs.io`, already verified for sending in his
account) to send: (1) a temporary password when someone new is signed up to a
team, forced to reset on first login; (2) certificate-earned emails; (3) weekly
progress reports; and (4) a settings list letting each user turn the optional ones
on/off.

## Decision

- **`lib/email.ts`** wraps the Resend SDK with one `send()` chokepoint: idempotency
  keys on every call, `{data,error}` checked (not try/catch, per the SDK contract),
  and failures logged + swallowed — email must never break the primary flow
  (signing someone up, issuing a certificate). Templates are hand-rolled inline-CSS
  HTML matching the app's glass/ink/accent look, not react-email — small enough
  that a template library would be net overhead.
- **`addMemberByEmail` (lib/org.ts) changes behavior**, replacing the old
  wait-for-self-signup invite flow: an email with no existing account gets a real
  account created **immediately** with a random temp password (`must_reset_password
  = 1`) and is emailed it; an email with an existing account joins immediately and
  gets a heads-up email. This is the single chokepoint used by the session-auth org
  UI, the partner REST API, and the MCP `add_employee` tool, so all three surfaces
  get the new behavior for free. The temp password is **never returned in any API
  response** — email is the only delivery channel.
- **Forced reset**: `app/app/layout.tsx` redirects to `/reset-password` whenever
  `must_reset_password` is set; `POST /api/auth/reset-password` clears it. Password
  hashing was extracted from `lib/auth.ts` into `lib/password.ts` to let `lib/org.ts`
  hash temp passwords without an `org.ts` ↔ `auth.ts` circular import (`auth.ts`
  already imports `createOrg`/`orgForUser` from `org.ts`).
- **Certificate email** fires from `POST /api/goals/[id]/complete`, gated on
  `notify_certificates` and on "was this genuinely the first issuance" (the route
  is idempotent — re-completing an already-certified goal must not re-send).
- **Weekly report** uses the same self-scheduling pattern as `lib/worker.ts`: an
  hourly, unref'd `setInterval` (`lib/weeklyReport.ts`, bootstrapped from the app
  layout) selects users where `notify_weekly_report=1` and `last_weekly_email_at`
  is null or 7+ days old. Hourly-checked rather than cron-scheduled so it
  self-corrects after downtime and needs no cron string.
- **Settings** (`/api/settings/notifications`, Settings page) exposes two toggles —
  certificate emails and weekly reports. Team sign-up emails are not toggleable;
  they're how someone gets into their account in the first place.

## Consequences

- `resend` (^6.17.2, above the skill's minimum) is a new dependency.
- `RESEND_API_KEY` / `RESEND_FROM` are set in `.env.local` and on Railway (never
  committed — `.env*` is gitignored).
- A live key was shared directly in conversation; recommended David rotate it in
  the Resend dashboard once this is confirmed working, since it now exists in chat
  history outside the app's own secret storage.
- Existing dangling `org_invites` rows (from before this change) still auto-accept
  via `acceptInvitesForUser` at signup — untouched for backward compatibility —
  but no new rows are written by `addMemberByEmail` going forward.

## Review

- Verified end-to-end against real Resend sends (`delivered@resend.dev` /
  `bounced@resend.dev`, per Resend's testing guidance — no real inboxes touched):
  temp-password email → login → forced `/reset-password` redirect → old password
  invalidated, new one works; existing-user "added to team" email; certificate
  email fires once on first issuance and is correctly skipped on idempotent
  re-completion; weekly-report scheduler auto-fires on boot and correctly excludes
  a user created after that tick; notification toggle persists. `tsc --noEmit` and
  `next build` clean.
