---
id: 0020
title: "Draft with AI" — one shared SMART co-pilot in front of every generation surface
status: proposed
owner: claude
date: 2026-07-19
---

## Context

Every generation surface (goals, plan intake, assignments, presentations, books,
study guides, and the new programs) was a blank box the user one-shots. David — an
org owner creating training for employees — found this confusing: no guidance on
*what* to say, so output disappointed and it wasn't clear how to fix it. He asked
for a short, SMART-goal-style AI conversation woven into all the parts of creation,
keeping the simple forms.

Underneath, every surface reduces to the same shape: `{rough text, kind of thing, a
few scalars} → a system prompt`. That uniformity means one co-pilot can serve them
all rather than N bespoke assistants.

## Decision

- **One shared engine, thin per-surface glue.**
  - `lib/draftSurfaces.ts` — an **isomorphic** registry (no server-only imports) with
    one entry per surface: its real form fields (keys matching the form's state),
    what "good" looks like, and the SMART emphasis. Imported by both the API route
    and the client component so field keys never drift.
  - `lib/draftAssistant.ts` + `POST /api/draft` — turn-based, **structured** (not
    streamed). Each turn returns strict JSON: `{mode:"ask",…}` or
    `{mode:"draft", fields, summary}`. Runs on the user's own AI creds via the
    existing `llmContext`/`withLlm`; `complete()` under the hood. Best-effort — never
    500s the form. Enriches context with `learnerProfile` for self surfaces; today's
    date is injected so relative deadlines ("in 3 weeks") resolve.
  - `components/app/DraftAssistant.tsx` — a reusable "✨ Draft with AI" panel:
    ≤3 SMART questions with tap-able quick replies, then an **editable review** of
    the drafted fields → "Use this" writes them into the parent form via `onApply`.
    The form stays the source of truth; the co-pilot only fills it.

- **Wired into every free-text surface at once**: assignments, programs, goals, goal
  plan intake, presentations, books, study guides. Surfaces with no free-text input
  (quizzes, exams, milestone→lessons) are excluded — nothing for a drafting chat to
  help with.

- **Programs authoring UI shipped** (no longer deferred): a new `Programs` tab in
  `OrgPanel` + `app/api/orgs/programs` (list/create/deploy/delete) + a program-outline
  generator (`generateProgramOutline` in `lib/coach.ts`) reusing the plan/expand
  prompt shape. Content is generated per-employee after deploy and localized by the
  existing translation engine, exactly like the normal lesson pipeline.

## Consequences

- New always-available generation dependency, but **non-blocking**: `/api/draft`
  failing just shows a retry; the plain forms work untouched if the user ignores it.
- The co-pilot conversation is **ephemeral** (client-held) — no new DB table.
- `mustDraft` ("skip questions — just draft it") is enforced by appending a trailing
  instruction turn, since the model didn't reliably obey a system-prompt-only flag.
- Verified end-to-end against live MiniMax: ask + draft on assignment/goal/program
  surfaces, program authoring (LLM outline → persist → list), and deploy → assignment.
  `tsc --noEmit` and `next build` clean; all `/app` pages 200.

## Review

Proposed — ratify the shared co-pilot as the standard front-end for all in-app
generation, and the in-app Programs authoring UI as the org program-authoring path
(alongside the existing snapshot + partner-API routes).
