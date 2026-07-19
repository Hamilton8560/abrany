---
id: 0019
title: Localize transactional emails via a pre-built static dictionary (not runtime AI)
status: proposed
owner: claude
date: 2026-07-19
---

## Context

Every transactional email (`lib/email.ts`, per ADR-0018) is hardcoded English, but
each user has a `language` (one of the 20 codes in `lib/languages.ts`). David asked
to "fix those emails to render whatever language there is." The rest of the app's
multi-language support is 100% runtime AI translation (MiniMax/Kimi) — there is no
static dictionary, `t()`, or i18n library anywhere. Emails, however, are a critical
path: they send from a background timer and today depend only on `RESEND_API_KEY`,
not on the AI keys.

## Decision

Localize emails with a **pre-built static dictionary**, not runtime AI translation:

- `lib/emailMessages.json` — `{ key: { langCode: string } }` for the ~10 strings
  across all five email templates, with `{var}` placeholders.
- `lib/emailI18n.ts` — `emailT(key, lang, vars?)` looks up the string, **falls back
  to English** on any missing language/key, and interpolates `{var}`.
- `scripts/build-email-i18n.ts` — a one-off, re-runnable generator that produces the
  20-language JSON **once** using the app's existing `translateLine` tooling, so we
  reuse the AI translation approach without hand-writing translations or paying for
  it on every send. The committed JSON is the runtime source of truth.

Each `send*Email` takes a `language` param; callers pass the recipient's
`user.language`.

## Consequences

- Transactional email stays **deterministic** and gains **no runtime dependency on
  the AI keys** — it still renders (in English worst case) even if MiniMax/Kimi are
  down or unconfigured.
- Diverges from the app's runtime-AI-translation norm: this is the first committed
  static translation asset in the codebase. Justified because these strings are few,
  near-static, and on a must-not-fail path.
- Translations are only as fresh as the last `build-email-i18n.ts` run; changing an
  email string means re-running the script and committing the updated JSON.
- Quality is machine-translated, not human-reviewed — acceptable for transactional
  copy; can be hand-corrected in the JSON per language if needed.

## Review

Proposed — approve the static-dictionary approach for transactional email, or
redirect to live AI translation at send time (matches the app pattern but adds
latency, cost, and an AI-key dependency to the email path).
