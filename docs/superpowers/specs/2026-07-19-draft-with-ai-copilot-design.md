# "Draft with AI" — a shared SMART co-pilot in front of every generation

**Date:** 2026-07-19
**Status:** approved (David: short chat → fills form; draft shown for approval; all surfaces)
**Goal:** Stop making people one-shot a blank box. Every place you create something for
yourself or an employee gets a short, SMART-framed AI conversation that drafts the
real form for you to review — simple forms you already know, with a guide on top.

## Problem

Every generation surface (goals, assignments, presentations, books, study guides,
and the not-yet-built programs) is a blank text box you one-shot. David — an org
owner creating training for employees — finds this confusing: no guidance on *what*
to say, so the output disappoints and it's unclear how to fix it. Underneath, every
surface reduces to the same shape: `{rough text, kind of thing, a few scalars} → a
system prompt`. That uniformity lets one co-pilot serve them all.

## Approach (David's decisions)

- **Short chat → fills the form.** A "✨ Draft with AI" assistant asks 2–3 sharp
  SMART questions, then populates the surface's real fields. Keep the simple forms.
- **Draft shown for approval.** The assistant produces editable filled fields; the
  user reviews/tweaks, then submits/generates as normal. Never auto-commits.
- **All surfaces at once**, built as one shared engine + thin per-surface glue.

## Architecture

### 1. Surface registry — `lib/draftSurfaces.ts` (isomorphic, no server deps)

One declarative entry per surface, importable by **both** client and server so field
keys never drift:

```ts
type DraftField = { key: string; label: string; kind: "text"|"textarea"|"date";
                    required?: boolean; hint?: string };
type DraftSurface = {
  id: string;            // "assignment"|"goal"|"goalPlan"|"presentation"|"book"|"studyGuide"|"program"
  noun: string;          // "training assignment"
  audience: "self"|"employee"|"team";
  fields: DraftField[];  // the real form fields the draft fills (keys match the form's state)
  good: string;          // what a great result looks like (steers the model)
  smart: string;         // surface-specific SMART emphasis
};
export const SURFACES: Record<string, DraftSurface>;
```

Dynamic option data (which employee, their level/language) is **not** in the registry
— it's passed as `context` at call time.

### 2. Engine — `lib/draftAssistant.ts` (server)

```ts
type DraftTurn = { role:"user"|"assistant"; content:string };
type DraftResult =
  | { mode:"ask";   question:string; quickReplies?:string[] }
  | { mode:"draft"; fields:Record<string,string>; summary:string };
async function runDraftTurn(o:{ surfaceId:string; messages:DraftTurn[]; context:string }): Promise<DraftResult>;
```

Builds the system prompt = `COACH_SYSTEM` + the surface's `noun`/`good`/`smart` +
the SMART rubric (Specific, Measurable, Achievable, Relevant, Time-bound — "ask ONLY
what's vague or missing, max 3 questions, one at a time, offer tap-able quick
replies, then draft") + the `context` block. Output contract: **strict JSON**, either
`{mode:"ask",...}` or `{mode:"draft", fields:{<field.key>:value}, summary}`. Parsed
with `jsonrepair` (already a dep) → validated against the surface's field keys →
unknown keys dropped, missing optional keys blank. Runs via `complete()` (structured,
non-streaming) — a short Q&A doesn't need token streaming and JSON control is cleaner.

### 3. API — `POST /api/draft`

Body `{ surface, messages, context? }`. `getSessionUser` → `llmContext(user)` (BYO/
server creds, same as every other generator) → enrich `context`: for `audience:self`
append the `learnerProfile(user.id).digest`; for `employee`/`team` append the caller's
role and the passed employee/team descriptor. `withLlm(creds, () => runDraftTurn(...),
user.language)` so questions come back in the user's language. Returns the
`DraftResult` JSON. Best-effort: on model/parse failure returns
`{mode:"ask", question:"..."}`-style graceful fallback, never 500s the form.

### 4. Component — `components/app/DraftAssistant.tsx` (reusable)

Props: `{ surfaceId, context?, seed?, onApply(values), triggerLabel? }`. Renders a
"✨ Draft with AI" trigger that opens a compact panel:

1. Optional seed line (prefilled from what the user already typed in the form).
2. Chat loop: shows the assistant's question + quick-reply chips + a text box; each
   answer POSTs the accumulated `messages` to `/api/draft`.
3. On `mode:"draft"`: a **review card** listing the drafted fields (each editable),
   with "Use this" (→ `onApply(values)`, closes, fills the parent form) and "Keep
   refining" (continue the chat).

Imports `SURFACES[surfaceId].fields` for labels/keys. The parent form stays the
source of truth — the assistant only writes values into it via `onApply`.

## Per-surface wiring (all at once)

Each create form mounts `<DraftAssistant surfaceId=… onApply=…/>` next to its submit
button; `onApply` sets the existing form state. No form is replaced.

| Surface | File | Fields the draft fills | Audience |
|---|---|---|---|
| Employee assignment | `OrgPanel.tsx` `AssignmentsTab` | title, description, note, dueAt | employee |
| Program (new) | `OrgPanel.tsx` `ProgramsTab` (new) | title, description | team |
| Goal | `app/app/goals/page.tsx` | title, description | self |
| Goal plan intake | `app/app/goals/[id]/page.tsx` | level, hoursPerWeek, targetDate, focus | self |
| Presentation | `app/app/presentations/page.tsx` | topic | self |
| Book | `app/app/books/page.tsx` | brief | self |
| Study guide | `components/app/GuidesPanel.tsx` `CreateGuide` | topic | self |

Surfaces with no free-text input (quizzes, exams, milestone→lessons) are out — a
drafting chat has nothing to help with there.

## Programs authoring (no longer deferred)

Give the org a real, AI-assisted way to author a reusable program and deploy it —
using the existing `lib/programs.ts` backend:

- **New `ProgramsTab` in `OrgPanel`** (add "Programs" to the tab list): lists programs
  (`listPrograms`), a "New program" flow, per-program "Deploy to employees" (pick
  members + due date → `deployProgram`) and delete (`deleteProgram`).
- **`app/api/orgs/programs/route.ts`** — admin-gated. `GET` lists; `POST` authors a
  program from a drafted brief: runs a **program-outline generator** (new
  `generateProgramOutline({title, description})` in `lib/coach.ts`, same shape as
  `generatePlanV2` + `expandMilestone` — milestones each with a 6-stage lesson arc of
  titles/objectives/kinds, no heavy content) → `createProgram(orgId, curriculum,
  sourceLang=user.language, createdBy)`. Lesson *content* is generated on demand by
  employees after deploy (consistent with today's assignment flow) and localized by
  the existing translation engine.
- **`app/api/orgs/programs/[id]/deploy/route.ts`** — admin-gated → `deployProgram`.
- **`app/api/orgs/programs/[id]/route.ts`** — `DELETE` → `deleteProgram`.
- The `program` surface in the registry co-pilots the "New program" brief (title +
  description + intended audience/outcome), so authoring a program is a short chat,
  not a blank box.

## Error handling

- The co-pilot is best-effort and non-blocking: `/api/draft` never 500s the form; a
  failure just shows a retry. The user can always ignore the assistant and fill the
  form by hand — nothing depends on it.
- Generation routes are unchanged in their own error handling.
- `runDraftTurn` caps questions (the prompt enforces ≤3; the client also forces a
  draft after the 3rd answer by flagging `context` so a stuck model still yields
  fields).

## Verification (repo convention — no test runner installed)

- `npx tsc --noEmit` and `npm run build` clean.
- Drive each surface in the real app: rough seed → 2–3 questions → drafted fields →
  edit → submit generates as before. Confirm employee-assignment and program flows
  end-to-end (author with co-pilot → deploy → employee sees the goal).
- Confirm the assistant asks in the user's language and that ignoring it leaves the
  plain form fully working.

## Out of scope

- No new persistence for the conversation (ephemeral, client-held).
- No replacing existing forms or generation prompts; the co-pilot sits in front.
- Full rich program lesson-content authoring UI (beyond outline) — employees still
  generate/deliver content through the existing pipeline.
