# Employee reset-link rescue + localized transactional emails

**Date:** 2026-07-19
**Status:** design (awaiting review)
**Related:** ADR-0018 (email notifications via Resend), ADR-0019 (static email localization — proposed by this work)

## Problem

An employee was signed up to an org but never received her account email, yet she
receives the weekly digest fine. Two root causes, both in the current flow:

1. **Idempotency traps the temp-password email.** `sendTempPasswordEmail` keys on
   `temp-password/${email}` (`lib/email.ts:86`) — not time-scoped — so Resend will
   never deliver a second temp-password email to the same address. If the first
   send failed, was skipped (no `RESEND_API_KEY` at that moment), or she already
   had an account (she'd get the no-password "added" heads-up instead), there is no
   recovery path today. An admin re-adding her hits `status: "already"` and sends
   nothing.
2. **No admin-facing recovery control.** There is no way for an org admin to
   re-issue access to a stuck employee.

Additionally, all transactional emails (`lib/email.ts`) are hardcoded English even
though every user has a `language` (one of 20 supported codes, `lib/languages.ts`),
so a non-English employee's rescue email — and every other email — arrives in a
language she may not read.

## Goals

- An org admin can send a **secure, single-use password reset link** to **any**
  member from the Team tab, at will, regardless of account state.
- The link works for locked-out / never-onboarded / forgot-password employees
  alike, and **always delivers** (unique idempotency key per issuance).
- **All** transactional emails render in the recipient's `language`, falling back
  to English for any missing string.

## Non-goals

- Not changing the initial add-employee flow (still issues a temp password on
  brand-new signup — untouched). This feature is the admin rescue path only.
- No self-service "forgot password" link on the public login page. (Same token
  infra would support it later; out of scope now.)
- No login lockout / account-disable status field.

---

## Part A — Reset-link rescue

### A1. Data: `password_reset_tokens` table (`lib/db.ts`)

```
password_reset_tokens(
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  token_hash   TEXT    NOT NULL,   -- sha256 hex of the raw token; raw is never stored
  expires_at   TEXT    NOT NULL,   -- ISO; now + 7 days
  used_at      TEXT,               -- ISO when consumed; NULL while valid
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
)
-- index on token_hash for lookup
```

Created via the same `addCol`/`CREATE TABLE IF NOT EXISTS` migration style already
used in `lib/db.ts`.

### A2. Token logic: `lib/passwordReset.ts`

- `RESET_TTL_MS = 7 * 24 * 60 * 60 * 1000`
- `createResetToken(userId): { token: string; id: number }`
  - Invalidates the user's prior unused tokens (`UPDATE ... SET used_at = now
    WHERE user_id = ? AND used_at IS NULL`) so only the newest link works.
  - `token = randomBytes(32).toString("base64url")`;
    `token_hash = sha256hex(token)`.
  - Inserts row, returns the **raw** token (shown only in the email) and the row
    `id` (used as the email idempotency key).
- `consumeResetToken(rawToken): number | null`
  - `SELECT id, user_id FROM ... WHERE token_hash = ? AND used_at IS NULL AND
    expires_at > now`.
  - Atomically claim: `UPDATE ... SET used_at = now WHERE id = ? AND used_at IS
    NULL`; only return `user_id` if that update affected a row (guards a
    double-submit race). Returns `null` for missing/expired/already-used.

### A3. Email: `sendPasswordResetEmail(...)` (`lib/email.ts`)

New template in the existing house style (`wrap`/`button`/`eyebrow`). Params:
`{ to, name, orgName, resetUrl, tokenId, language }`. Button → `resetUrl`
(`${appBaseUrl()}/reset?token=<raw>`). **Idempotency key
`password-reset/${tokenId}`** — unique per issuance, so re-sends always deliver
(this is the specific fix for the trapped-email bug). Copy is localized per Part B.

### A4. Admin API: `POST /api/orgs/members/[id]/reset-link`

`[id]` is the member's `user_id` (same convention as the existing
`DELETE /api/orgs/members/[id]`). Session-gated and **admin-gated** exactly like the
sibling member routes: the caller must be an admin of the org, and the target
`user_id` must be a current member of that org (else 403/404 — an admin cannot
issue links to arbitrary users). On success: `createResetToken(userId)`, build the
URL, `sendPasswordResetEmail(... language: targetUser.language ...)`, return
`{ ok: true }`. The raw token is never returned in the response — email is the only
channel (consistent with ADR-0018's temp-password rule).

### A5. Public consume API: `POST /api/auth/reset-with-token`

New **unauthenticated** route (distinct from the session-gated
`/api/auth/reset-password`, which is left untouched). Body `{ token, newPassword }`.
Validates `newPassword.length >= 8`, calls `consumeResetToken(token)`; on `null`
returns `{ error }` 400 ("This link is invalid or has expired"). On success:
`setUserPassword`, `setMustResetPassword(userId, false)`, `startSession(userId)`,
return `{ ok: true }` → client redirects into `/app`.

### A6. Public page: `app/reset/page.tsx` + token-aware form

New public route (no session redirect — unlike `app/reset-password`). Reads
`?token=` from the URL, renders a set-password form reusing the visual style of
`components/ResetPasswordForm.tsx` (new component
`components/TokenResetForm.tsx` or a `token`-prop variant). POSTs to
`/api/auth/reset-with-token`. Clear empty-state when no/expired token: "This link
is invalid or has expired — ask your admin to send a new one."

### A7. UI: Team tab (`components/app/OrgPanel.tsx`, `TeamTab`)

A "Send reset link" action on **every** member row. POSTs to
`/api/orgs/members/${user_id}/reset-link`; on success shows a toast/inline
confirmation "Reset link sent to {email}"; on failure surfaces the error. Follows
the existing add/delete member interaction patterns in `TeamTab`.

---

## Part B — Localized transactional emails

Decision recorded in **ADR-0019**: a **pre-built static dictionary**, not runtime
AI translation. Rationale: transactional email is a critical path that today needs
only `RESEND_API_KEY` and runs from a background timer; a static dictionary keeps it
deterministic and free of any AI-key dependency, while a one-time build script uses
the app's existing AI translation tooling so we don't hand-write 20 languages.

### B1. Message catalog: `lib/emailMessages.json` + `lib/emailI18n.ts`

- **Catalog** `lib/emailMessages.json`: `{ [key]: { [langCode]: string } }`. Keys
  are the human-readable strings for all five templates
  (`sendTempPasswordEmail`, `sendOrgAddedEmail`, `sendCertificateEmail`,
  `sendWeeklyReportEmail`, `sendPasswordResetEmail`) — subject lines, headings,
  body sentences, button labels, footers. Strings carry `{var}` placeholders
  (e.g. `"{orgName} sent you a link"`).
- **Helper** `lib/emailI18n.ts`: `emailT(key, lang, vars?)` → returns the string for
  `lang`, falling back to the `en` entry if the language (or the key in that
  language) is missing, then interpolating `{var}` from `vars`. `lang` is
  normalized through `isSupported` (`lib/languages.ts`), defaulting to `"en"`.

### B2. Build script: `scripts/build-email-i18n.ts`

A one-off, re-runnable generator. Holds the English source strings, and for each
supported language (`LANGUAGES` in `lib/languages.ts`, minus `en`) calls
`translateLine` (`lib/coach.ts`) — the same server-side translation the app already
uses — to produce each string, preserving `{var}` placeholders (instructed in the
prompt). Writes `lib/emailMessages.json`. The committed JSON is the source of truth
at runtime; the script is only re-run when strings change or a language is added.
`en` entries are the verbatim source strings (no AI).

### B3. Thread `language` into every `send*Email`

Each template function takes a `language` param and pulls copy via `emailT(...)`
instead of inline English literals. Callers pass the recipient's language:

- `addMemberByEmail` (`lib/org.ts`) — `existing.language` / `created.language` for
  the added / temp-password emails.
- Certificate email caller (`app/api/goals/[id]/complete`) — the user's language.
- `lib/weeklyReport.ts` — `usersDueWeeklyReport()` already SELECTs `language`
  (`lib/repo.ts:81`); forward it (currently ignored).
- Reset-link route (A4) — the target member's language.

Missing/unsupported language → English fallback, so nothing ever fails to render.

---

## Error handling

- All sends remain best-effort (the `send()` chokepoint logs + swallows), so a
  translation-lookup or email failure never breaks the primary flow. `emailT`
  cannot throw — worst case it returns the English string or the raw key.
- Token consume is atomic and fail-closed: any doubt → `null` → generic "invalid or
  expired" message (no user enumeration; same response whether the token is
  unknown, expired, or already used).
- Admin route returns 403 for non-admins and for targets outside the caller's org.

## Testing

- **Unit** (`lib/passwordReset.ts`): create→consume happy path; expired token →
  null; reused token → null on second consume; issuing a new token invalidates the
  prior one; unknown token → null.
- **Unit** (`lib/emailI18n.ts`): known key+lang returns translated string; missing
  language falls back to English; `{var}` interpolation; unsupported code → English.
- **Integration**: admin route rejects non-admins and cross-org targets; issues a
  link + sends for a valid member. Consume route sets password, clears
  `must_reset_password`, starts a session; rejects a bad/expired token.
- **End-to-end**: admin clicks "Send reset link" → email (to Resend test addresses,
  per ADR-0018's method) → `/reset?token=` → set password → land in `/app`; old
  password no longer works, new one does. Spot-check one non-English recipient
  renders localized copy.

## Rollout / ops notes

- New table auto-migrates on boot (no manual step).
- No new env vars. Localization adds **no** runtime dependency on the AI keys (the
  build script needs them, but only when regenerating the catalog).
- `lib/emailMessages.json` is committed (unlike `.env*`).
