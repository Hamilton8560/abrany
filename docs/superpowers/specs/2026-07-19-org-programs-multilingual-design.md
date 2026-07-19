# Design: Org Programs — author once, deploy to many, deliver multilingually, monitor in your language

**Date:** 2026-07-19
**Status:** Draft for David's review
**Topic:** Company/organization side — reusable multilingual training programs

## Problem

An organization owner (David) manages a team and wants to:

1. **Create reusable programs** — author a lesson plan once and keep it, instead of the
   current throwaway one-off-per-employee assignment.
2. **Deploy directly to many employees at once** — bulk, not one person at a time.
3. **Author once, deliver localized** — write the program in his own language (English);
   each employee automatically receives it in *their* language.
4. **Monitor in his own language** — the dashboard and the content he reviews stay in
   English, even when an employee is studying the same course in Spanish.

The trigger: today an employee's AI generates their curriculum in their own language, so the
owner sees Spanish titles/content he can't read ("they're all Spanish and I don't speak Spanish").

## What already exists (reused, not rebuilt)

- **Orgs / members / invites / email onboarding** (`lib/org.ts`, `app/api/orgs/*`,
  `components/app/OrgPanel.tsx`).
- **Assignments**: `createAssignment({orgId, userId, curriculum, dueAt, note})` copies a
  `CurriculumInput` into a fresh **goal under the employee's account**, creates plan items,
  lesson stubs, content, and exams. Progress tracking (`AssignmentProgress`): reading time,
  focus time, sections done, exam score, pass/fail, late.
- **Partner API/MCP** authoring path (`lib/orgApi.ts` `buildAssignment`, `/api/v1`, `/api/mcp`).
- **Translation engine** (`lib/translate.ts`, `app/api/translate/route.ts`): per-content-item,
  background-queued, cached by `(kind, id, lang)`, deduped key `translation:kind:id:lang`.
  Content carries a `language` column; `resolveSourceLanguage` detects+persists if unset.
  `TranslateControl` renders the reader-side control; `enqueueTranslation` starts a job.
- **Per-user `language`** preference already drives display language.
- **White-label certificates** already flow from assignments (`orgForGoal`).

## Core concept

A **Program** = a reusable, org-owned lesson-plan template, stored in a library, distinct from
any user goal. Authored in one canonical `source_lang`. Deploying a program *instantiates* it as
a normal per-employee assignment (existing machinery), then localizes delivery via the existing
translation engine.

## Data model (new)

Mirrors the existing `goal → plan → lessons` shape, but org-owned:

```sql
CREATE TABLE programs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_lang TEXT NOT NULL DEFAULT 'en',   -- language the program is authored in
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE program_milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  estimate    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE program_lessons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id INTEGER NOT NULL REFERENCES program_milestones(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  objective    TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'read',  -- read|teach|practice|apply|check|review
  content      TEXT NOT NULL DEFAULT ''
);

-- one new column on the existing table:
ALTER TABLE assignments ADD COLUMN program_id INTEGER
  REFERENCES programs(id) ON DELETE SET NULL;  -- groups deployed assignments by program
CREATE INDEX idx_assign_program ON assignments(program_id);
```

`ON DELETE SET NULL` on `assignments.program_id`: deleting a program must never delete or orphan
an employee's goal — the course they're studying survives; only the grouping link clears.

## Flow

### 1. Author a program (admin only)

- **In-app (primary new UI):** owner types a brief ("Forklift safety, warehouse crew,
  beginner") → the existing AI plan+lesson generation drafts milestones/lessons/content **in the
  owner's UI language** (via `languageDirective`) → owner reviews and edits inline → saves.
  Drafting is asynchronous through the existing FIFO queue, exactly like a personal goal's plan.
- **API/MCP (parity):** `POST /api/v1/programs` with a `CurriculumInput`-shaped body writes into
  the same tables. `GET /api/v1/programs`, `GET /api/v1/programs/:id`, `DELETE` too. New MCP tools
  mirror these.
- Both paths write the same `programs` records → **one shared library**.

### 2. Deploy to many (admin only)

- Owner picks a program, selects N employees (checkboxes + "select all"), optional due date + note.
- For each selected employee: `programToCurriculum(program)` → existing
  `createAssignment({ orgId, userId, curriculum, dueAt, note, assignedBy })`, stamping `program_id`.
- Reuses all existing assignment plumbing: progress, pass/fail, certificates.
- Re-deploying to someone who already has an active assignment for that program is skipped (report
  "already assigned") rather than duplicated.

### 3. Localize on delivery

- Deployed lesson rows are stamped `language = program.source_lang`.
- Employee reads in their own language through the **existing** translate flow: background-queued,
  cached, deduped. Per-user `language` drives display.
- To make delivery feel instant rather than a manual click, `deployProgram` **pre-enqueues** a
  translation job per lesson for each employee whose `language` ≠ `source_lang`, using
  `enqueueTranslation`. Dedup by the existing key means no wasted work; the FIFO cap means a large
  rollout drains politely in the background.

### 4. Monitor in your language

- **Program engagement view** groups `assignments` by `program_id`. Per program: deployed count,
  started, in-progress, passed, failed/overdue, avg reading time, avg exam score, and per-employee
  rows (reusing `AssignmentProgress`).
- Everything the owner reviews is the **canonical source-language program** (English) — titles,
  section names, content preview — because the program is the source of truth and the Spanish
  copies are derived. The owner never has to read a language he doesn't speak.

## Surfaces / files

- **DB:** new tables + `assignments.program_id` in `lib/db.ts`.
- **`lib/programs.ts` (new):** `Program` types; CRUD (`createProgram`, `getProgram`, `listPrograms`,
  `updateProgram`, `deleteProgram`, `setProgramContent`); `programToCurriculum(program)`;
  `deployProgram({ orgId, programId, userIds, dueAt, note, assignedBy })` (loops `createAssignment`
  + pre-enqueues translations); `programEngagement(orgId)` aggregation.
- **`lib/orgApi.ts` (extend):** `buildProgram(org, input)` shared by in-app + API/MCP (mirrors
  `buildAssignment`); program serializers.
- **API routes:**
  - `app/api/orgs/programs/route.ts` — GET list, POST create.
  - `app/api/orgs/programs/[id]/route.ts` — GET, PATCH (edit), DELETE.
  - `app/api/orgs/programs/[id]/deploy/route.ts` — POST deploy-to-many.
  - `app/api/v1/programs/*` + MCP tools — partner parity.
- **UI (`components/app/OrgPanel.tsx`):** new **Programs** tab — library grid, author form
  (brief → AI draft → edit → save), deploy modal (multi-select employees). New **Engagement** view
  (own tab, or Assignments grouped by program). The existing one-off "Assign education" stays.

## Build order (each item independently shippable)

1. Program data model + CRUD + in-app AI authoring (draft → edit → save). → *reusable library*
2. Deploy-to-many from a program (bulk `createAssignment`, `program_id` stamp, skip dupes). → *bulk deploy*
3. Pre-enqueue per-employee translation on deploy; confirm reader auto-localizes. → *auto-localize*
4. Program engagement dashboard in the owner's language. → *monitor in your language*
5. API/MCP program endpoints (parity). → *technical-partner authoring*

## Decisions taken (flag on review if wrong)

- **Authoring = Both** (in-app AI is the main new UI; API/MCP writes the same library).
- **Language model = one canonical `source_lang` per program; lazy + cached translation on
  delivery** — reuses `translate.ts` exactly; owner monitors against the source. (Alternative
  considered: eager full translation at deploy — rejected as redundant with the cache and heavier
  on the queue. Pre-enqueue is the middle ground.)
- **Deploy instantiates a copy** into each employee's goal (existing model), rather than employees
  sharing one live program object. Keeps "employees control their own education freely" — their
  copy is theirs to study at their pace, consistent with today's assignment model.

## Out of scope (v1)

- Translating an employee's **free-text quiz/exam answers** back into the owner's language for
  review. (Engagement metrics and grades are language-neutral; only free text isn't. Note for v2.)
- Editing a deployed program and pushing the edit to already-assigned employees (versioning).
  v1: edits affect future deploys only.
- Employee-facing UI changes beyond what already exists — they study assigned programs exactly as
  they study assignments today.

## Related decision record

This introduces a new architectural concept (org-owned program templates + localized delivery).
Per the Dev Cockpit protocol, a proposed ADR should accompany implementation:
`docs/decisions/0015-org-programs-localized-delivery.md` (`status: proposed`).
