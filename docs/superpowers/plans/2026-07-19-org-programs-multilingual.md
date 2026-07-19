# Org Programs — Multilingual Reusable Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org owner author a training program once, deploy it to many employees at once, have each employee receive it in their own language, and monitor engagement in the owner's language.

**Architecture:** A **Program** is a reusable, org-owned lesson-plan template stored in dedicated tables (`programs` / `program_milestones` / `program_lessons`), authored in one canonical `source_lang`. In-app authoring reuses the entire existing goal → plan → lesson-content generation pipeline and course editor: the owner builds a course as they do today, then a `snapshotGoalToProgram` copies it into the program tables. Deploying reverses that: `programToCurriculum` builds the `CurriculumInput` the existing `createAssignment` already consumes, instantiating a per-employee copy/goal and stamping `assignments.program_id`. Per-employee localization pre-enqueues the existing background translation jobs.

**Tech Stack:** Next.js (this repo's vendored fork — read `node_modules/next/dist/docs/` before touching routing/APIs), `node:sqlite` via `lib/db.ts`, React client components, existing `lib/repo.ts` / `lib/org.ts` / `lib/worker.ts` / `lib/translate.ts`.

## Global Constraints

- **No test framework exists** (scripts are only `dev`/`build`/`start`; zero test files). Do NOT add one. Verification for every task = `npm run build` (TypeScript typecheck + Next build must pass) plus the stated functional check (a throwaway `node --experimental-strip-types` script against `lib/*`, or a `curl`/UI check against `npm run dev`). Delete any throwaway script before committing.
- **SQLite via `node:sqlite`** only (ADR 0001) — no new DB dependency.
- **Schema changes go in `lib/db.ts`**: new tables inside the `db.exec(\`…\`)` block in `migrate()`; new columns via the existing guarded `addCol(table, col, def)` helper (idempotent `ALTER TABLE … ADD COLUMN`).
- **Admin-only**: every org-programs write path must gate on `orgForUser(user.id)?.role === 'admin'`, mirroring `requireAdmin()` in `app/api/orgs/assignments/route.ts`.
- **Deleting a program must never delete or orphan an employee's goal** — `assignments.program_id` is `ON DELETE SET NULL`.
- **Lesson kinds** are exactly: `read | teach | practice | apply | check | review` (`LessonKind` in `lib/repo.ts:267`).
- **Commit style**: end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Work stays on branch `feat/org-programs`; integrate via PR + merge (do not push to `main`).

---

### Task 1: Database schema — program tables + assignment link

**Files:**
- Modify: `lib/db.ts` (inside `migrate()`: the `db.exec` DDL block ~line 224–239, and the guarded `addCol` section ~line 336+)

**Interfaces:**
- Produces (SQL surface later tasks rely on):
  - `programs(id, org_id, title, description, source_lang, created_by, created_at, updated_at)`
  - `program_milestones(id, program_id, order_index, title, detail, estimate)`
  - `program_lessons(id, milestone_id, order_index, title, objective, kind, content)`
  - `assignments.program_id INTEGER NULL` (FK → programs, `ON DELETE SET NULL`)

- [ ] **Step 1: Add the three program tables** to the DDL block in `migrate()` in `lib/db.ts`, immediately after the `assignments` table / its indexes (~line 239):

```sql
-- reusable, org-owned lesson-plan templates (authored once, deployed to many)
CREATE TABLE IF NOT EXISTS programs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_lang TEXT NOT NULL DEFAULT 'en',   -- language the program is authored in
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS program_milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  estimate    TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS program_lessons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id INTEGER NOT NULL REFERENCES program_milestones(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  objective    TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'read',
  content      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_prog_org      ON programs(org_id);
CREATE INDEX IF NOT EXISTS idx_prog_ms_prog  ON program_milestones(program_id);
CREATE INDEX IF NOT EXISTS idx_prog_le_ms    ON program_lessons(milestone_id);
```

- [ ] **Step 2: Add the `assignments.program_id` column** in the guarded-column section (near the other `addCol(...)` calls, ~line 336+):

```ts
// assignments deployed from a reusable program link back to it (SET NULL keeps
// the employee's goal alive if the program is later deleted)
addCol(
  "assignments",
  "program_id",
  "program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL",
);
```

- [ ] **Step 3: Add the grouping index** on the new column. Because `program_id` is created by `addCol` (a runtime `ALTER TABLE`), its index must be created *after* that call — not in the static DDL block. On the line immediately after the `addCol("assignments", "program_id", …)` call from Step 2, add:

```ts
getDb().exec("CREATE INDEX IF NOT EXISTS idx_assign_program ON assignments(program_id)");
```

- [ ] **Step 4: Verify build + schema** — run:

```bash
npm run build
```

Expected: build succeeds. Then verify tables exist with a throwaway script `/tmp/schema-check.ts`:

```ts
import { getDb } from "./lib/db";
const rows = getDb()
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'program%'")
  .all();
console.log(rows);
const cols = getDb().prepare("PRAGMA table_info(assignments)").all() as { name: string }[];
console.log("has program_id:", cols.some((c) => c.name === "program_id"));
```

Run: `node --experimental-strip-types /tmp/schema-check.ts`
Expected: prints the three `program*` table names and `has program_id: true`. Then `rm /tmp/schema-check.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat(programs): schema — program tables + assignments.program_id link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `lib/programs.ts` — types, CRUD, snapshot, and curriculum builder

**Files:**
- Create: `lib/programs.ts`
- Read for reference: `lib/org.ts` (`CurriculumInput`, `createAssignment`), `lib/market.ts:145` (`cloneCourse` copy pattern), `lib/repo.ts` (`getPlanForGoal`, `LessonKind`)

**Interfaces:**
- Consumes: `getDb` from `./db`; `CurriculumInput` and `Org` from `./org`; `LessonKind` from `./repo`.
- Produces (later tasks rely on these exact signatures):
  - `type Program = { id: number; org_id: number; title: string; description: string; source_lang: string; created_by: number | null; created_at: string; updated_at: string }`
  - `type ProgramLesson = { id: number; title: string; objective: string; kind: LessonKind; content: string }`
  - `type ProgramMilestone = { id: number; title: string; detail: string; estimate: string; lessons: ProgramLesson[] }`
  - `type ProgramFull = Program & { milestones: ProgramMilestone[]; lesson_count: number }`
  - `createProgram(orgId: number, input: CurriculumInput, sourceLang: string, createdBy: number | null): Program`
  - `getProgram(id: number): Program | undefined`
  - `getProgramFull(id: number): ProgramFull | undefined`
  - `listPrograms(orgId: number): (Program & { milestone_count: number; lesson_count: number })[]`
  - `deleteProgram(orgId: number, id: number): void`
  - `snapshotGoalToProgram(goalId: number, orgId: number, sourceLang: string, createdBy: number | null): Program | { error: string }`
  - `programToCurriculum(id: number): CurriculumInput | undefined`

- [ ] **Step 1: Write `lib/programs.ts`** with the full implementation:

```ts
import { getDb } from "./db";
import type { CurriculumInput } from "./org";
import type { LessonKind } from "./repo";

/**
 * Programs: reusable, org-owned lesson-plan templates. Authored once in a
 * canonical `source_lang` (in-app via snapshotGoalToProgram, or pushed in via
 * the partner API as a CurriculumInput), then deployed to many employees —
 * where the existing translation engine localizes delivery per employee.
 */

const KINDS: LessonKind[] = ["read", "teach", "practice", "apply", "check", "review"];
const asKind = (k: unknown): LessonKind => (KINDS.includes(k as LessonKind) ? (k as LessonKind) : "read");

export type Program = {
  id: number;
  org_id: number;
  title: string;
  description: string;
  source_lang: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};
export type ProgramLesson = { id: number; title: string; objective: string; kind: LessonKind; content: string };
export type ProgramMilestone = { id: number; title: string; detail: string; estimate: string; lessons: ProgramLesson[] };
export type ProgramFull = Program & { milestones: ProgramMilestone[]; lesson_count: number };

export function getProgram(id: number): Program | undefined {
  return getDb().prepare("SELECT * FROM programs WHERE id = ?").get(id) as Program | undefined;
}

/** Persist a CurriculumInput as a new program (milestones + lessons + any content). */
export function createProgram(
  orgId: number,
  input: CurriculumInput,
  sourceLang: string,
  createdBy: number | null,
): Program {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO programs (org_id, title, description, source_lang, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(orgId, input.title.slice(0, 200), (input.description ?? "").toString(), sourceLang, createdBy);
  const programId = Number(info.lastInsertRowid);
  const insMs = db.prepare(
    "INSERT INTO program_milestones (program_id, order_index, title, detail, estimate) VALUES (?, ?, ?, ?, ?)",
  );
  const insLe = db.prepare(
    "INSERT INTO program_lessons (milestone_id, order_index, title, objective, kind, content) VALUES (?, ?, ?, ?, ?, ?)",
  );
  (input.milestones ?? []).forEach((m, mi) => {
    const msId = Number(insMs.run(programId, mi, m.title, m.detail ?? "", m.estimate ?? "").lastInsertRowid);
    (m.lessons ?? []).forEach((l, li) =>
      insLe.run(msId, li, l.title, l.objective ?? "", asKind(l.kind), l.content ?? ""),
    );
  });
  return getProgram(programId)!;
}

export function getProgramFull(id: number): ProgramFull | undefined {
  const db = getDb();
  const program = getProgram(id);
  if (!program) return undefined;
  const milestones = db
    .prepare("SELECT * FROM program_milestones WHERE program_id = ? ORDER BY order_index, id")
    .all(id) as { id: number; title: string; detail: string; estimate: string }[];
  const lessonStmt = db.prepare(
    "SELECT id, title, objective, kind, content FROM program_lessons WHERE milestone_id = ? ORDER BY order_index, id",
  );
  let lessonCount = 0;
  const full = milestones.map((m) => {
    const lessons = (lessonStmt.all(m.id) as ProgramLesson[]).map((l) => ({ ...l, kind: asKind(l.kind) }));
    lessonCount += lessons.length;
    return { id: m.id, title: m.title, detail: m.detail, estimate: m.estimate, lessons };
  });
  return { ...program, milestones: full, lesson_count: lessonCount };
}

export function listPrograms(orgId: number): (Program & { milestone_count: number; lesson_count: number })[] {
  return getDb()
    .prepare(
      `SELECT p.*,
         (SELECT COUNT(*) FROM program_milestones ms WHERE ms.program_id = p.id) AS milestone_count,
         (SELECT COUNT(*) FROM program_lessons le JOIN program_milestones ms ON ms.id = le.milestone_id
            WHERE ms.program_id = p.id) AS lesson_count
       FROM programs p WHERE p.org_id = ? ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all(orgId) as (Program & { milestone_count: number; lesson_count: number })[];
}

export function deleteProgram(orgId: number, id: number): void {
  // assignments.program_id is ON DELETE SET NULL — employee goals are untouched
  getDb().prepare("DELETE FROM programs WHERE id = ? AND org_id = ?").run(id, orgId);
}

/** Build the CurriculumInput the existing createAssignment consumes, from a stored program. */
export function programToCurriculum(id: number): CurriculumInput | undefined {
  const p = getProgramFull(id);
  if (!p) return undefined;
  return {
    title: p.title,
    description: p.description,
    milestones: p.milestones.map((m) => ({
      title: m.title,
      detail: m.detail,
      estimate: m.estimate,
      lessons: m.lessons.map((l) => ({ title: l.title, objective: l.objective, kind: l.kind, content: l.content })),
    })),
  };
}

/**
 * Snapshot a finished course (goal → latest plan → lessons) into a new program.
 * This is the in-app authoring path: the owner builds a course with the normal
 * goal/plan/lesson pipeline (in their language) and edits it in the course
 * editor, then saves it to the org library. Copies titles/objectives/kinds and
 * whatever generated content exists at snapshot time.
 */
export function snapshotGoalToProgram(
  goalId: number,
  orgId: number,
  sourceLang: string,
  createdBy: number | null,
): Program | { error: string } {
  const db = getDb();
  const goal = db.prepare("SELECT id, title, description FROM goals WHERE id = ?").get(goalId) as
    | { id: number; title: string; description: string }
    | undefined;
  if (!goal) return { error: "Goal not found" };
  const plan = db
    .prepare("SELECT id FROM plans WHERE goal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(goalId) as { id: number } | undefined;
  if (!plan) return { error: "This goal has no plan yet — generate its plan before saving as a program" };

  const items = db
    .prepare("SELECT id, title, detail, estimate FROM plan_items WHERE plan_id = ? ORDER BY order_index, id")
    .all(plan.id) as { id: number; title: string; detail: string; estimate: string }[];
  const lessonStmt = db.prepare(
    "SELECT title, objective, kind, content FROM lessons WHERE plan_item_id = ? ORDER BY order_index, id",
  );
  const curriculum: CurriculumInput = {
    title: goal.title,
    description: goal.description ?? "",
    milestones: items.map((it) => ({
      title: it.title,
      detail: it.detail,
      estimate: it.estimate,
      lessons: (lessonStmt.all(it.id) as { title: string; objective: string; kind: string; content: string }[]).map(
        (l) => ({ title: l.title, objective: l.objective, kind: asKind(l.kind), content: l.content }),
      ),
    })),
  };
  return createProgram(orgId, curriculum, sourceLang, createdBy);
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds (no type errors — `CurriculumInput` and `LessonKind` imports resolve).

- [ ] **Step 3: Functional check** — throwaway `/tmp/prog-check.ts`:

```ts
import { createProgram, getProgramFull, programToCurriculum, listPrograms } from "./lib/programs";
import { getDb } from "./lib/db";
// need a real org row; grab or make one
let org = getDb().prepare("SELECT id FROM orgs LIMIT 1").get() as { id: number } | undefined;
if (!org) {
  const u = getDb().prepare("SELECT id FROM users LIMIT 1").get() as { id: number };
  const info = getDb().prepare("INSERT INTO orgs (name, owner_user_id, api_key) VALUES ('T', ?, 'abr_org_test')").run(u.id);
  org = { id: Number(info.lastInsertRowid) };
}
const p = createProgram(
  org!.id,
  { title: "Forklift Safety", description: "warehouse", milestones: [
    { title: "Pre-op", lessons: [{ title: "Checklist", kind: "read", content: "Inspect the forks." }] },
  ] },
  "en",
  null,
);
console.log("created", p.id, listPrograms(org!.id).map((r) => [r.title, r.milestone_count, r.lesson_count]));
console.log("full", JSON.stringify(getProgramFull(p.id)?.milestones));
console.log("curriculum roundtrip title:", programToCurriculum(p.id)?.title);
```

Run: `node --experimental-strip-types /tmp/prog-check.ts`
Expected: prints `created <id>`, a listing row `["Forklift Safety", 1, 1]`, the milestone JSON with the lesson content, and `curriculum roundtrip title: Forklift Safety`. Then `rm /tmp/prog-check.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/programs.ts
git commit -m "feat(programs): library core — CRUD, snapshot-from-goal, curriculum builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Deploy a program to many employees (with per-employee localization)

**Files:**
- Modify: `lib/org.ts` — thread an optional `programId` through `createAssignment` and its INSERT; add `hasActiveAssignmentForProgram`.
- Modify: `lib/programs.ts` — add `deployProgram`.
- Read for reference: `lib/worker.ts:245` (`enqueueTranslation(kind, id, lang, userId)`), `lib/repo.ts` (`getUserByEmail`), `lib/languages.ts` (`isSupported`).

**Interfaces:**
- Consumes: `createAssignment` (extended), `memberRole`, `Org` from `./org`; `enqueueTranslation` from `./worker`; `getUserByEmail` / user `language` from `./repo`.
- Produces:
  - `createAssignment` gains `programId?: number | null` in its input object and stores it.
  - `hasActiveAssignmentForProgram(orgId: number, userId: number, programId: number): boolean` in `lib/org.ts`.
  - `deployProgram(input: { orgId: number; programId: number; userIds: number[]; dueAt?: string | null; note?: string; assignedBy?: number | null }): { deployed: number; skipped: number; results: { userId: number; status: "deployed" | "skipped" | "error"; error?: string }[] }` in `lib/programs.ts`.

- [ ] **Step 1: Extend `createAssignment` in `lib/org.ts`** to accept and store `programId`. Change its input type (add `programId?: number | null;`) and the INSERT (line ~286–290) to:

```ts
  const info = db
    .prepare(
      "INSERT INTO assignments (org_id, user_id, goal_id, assigned_by, note, due_at, program_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.orgId,
      input.userId,
      goal.id,
      input.assignedBy ?? null,
      input.note ?? "",
      input.dueAt ?? null,
      input.programId ?? null,
    );
```

Also add `program_id: number | null;` to the `Assignment` type (line ~55–66).

- [ ] **Step 2: Add `hasActiveAssignmentForProgram` to `lib/org.ts`** (near `getAssignment`):

```ts
/** True if this employee already has a non-failed assignment from this program. */
export function hasActiveAssignmentForProgram(orgId: number, userId: number, programId: number): boolean {
  return !!getDb()
    .prepare(
      "SELECT 1 FROM assignments WHERE org_id = ? AND user_id = ? AND program_id = ? AND status != 'failed' LIMIT 1",
    )
    .get(orgId, userId, programId);
}
```

- [ ] **Step 3: Add `deployProgram` to `lib/programs.ts`** (imports at top: add `import { createAssignment, memberRole, hasActiveAssignmentForProgram } from "./org";`, `import { enqueueTranslation } from "./worker";`, `import { getDb } from "./db";` already present, and `import { getUserByEmail } from "./repo";` is not needed — we take userIds):

```ts
import { createAssignment, memberRole, hasActiveAssignmentForProgram } from "./org";
import { enqueueTranslation } from "./worker";
import { isSupported } from "./languages";

/**
 * Deploy a program to many employees at once. Each employee gets their own copy
 * (a goal under their account) via the existing createAssignment; we stamp
 * program_id for cohort grouping and pre-enqueue a translation of every lesson
 * that has content into the employee's language (skipped when it matches the
 * program's source language). Employees already actively assigned this program
 * are skipped rather than duplicated.
 */
export function deployProgram(input: {
  orgId: number;
  programId: number;
  userIds: number[];
  dueAt?: string | null;
  note?: string;
  assignedBy?: number | null;
}): { deployed: number; skipped: number; results: { userId: number; status: "deployed" | "skipped" | "error"; error?: string }[] } {
  const db = getDb();
  const program = getProgram(input.programId);
  if (!program || program.org_id !== input.orgId)
    return { deployed: 0, skipped: 0, results: input.userIds.map((userId) => ({ userId, status: "error", error: "Program not found" })) };
  const curriculum = programToCurriculum(input.programId)!;
  const results: { userId: number; status: "deployed" | "skipped" | "error"; error?: string }[] = [];
  let deployed = 0;
  let skipped = 0;

  for (const userId of input.userIds) {
    if (!memberRole(input.orgId, userId)) {
      results.push({ userId, status: "error", error: "Not a member of this organization" });
      continue;
    }
    if (hasActiveAssignmentForProgram(input.orgId, userId, input.programId)) {
      skipped++;
      results.push({ userId, status: "skipped" });
      continue;
    }
    const assignment = createAssignment({
      orgId: input.orgId,
      userId,
      assignedBy: input.assignedBy ?? null,
      note: input.note ?? "",
      dueAt: input.dueAt ?? null,
      curriculum,
      programId: input.programId,
    });
    // pre-enqueue translations so content is ready when the employee opens it
    const user = db.prepare("SELECT language FROM users WHERE id = ?").get(userId) as { language: string } | undefined;
    const lang = user?.language ?? "en";
    if (lang !== program.source_lang && isSupported(lang)) {
      const lessons = db
        .prepare(
          `SELECT l.id FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id
             JOIN plans p ON p.id = pi.plan_id
           WHERE p.goal_id = ? AND l.content != '' AND l.content IS NOT NULL`,
        )
        .all(assignment.goal_id) as { id: number }[];
      for (const l of lessons) enqueueTranslation("lesson", l.id, lang, userId);
    }
    deployed++;
    results.push({ userId, status: "deployed" });
  }
  return { deployed, skipped, results };
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds. If `createAssignment`'s input type is inline, ensure `programId` is added there (not only in the INSERT) so TypeScript accepts the new field.

- [ ] **Step 5: Functional check** — throwaway `/tmp/deploy-check.ts`:

```ts
import { deployProgram, createProgram } from "./lib/programs";
import { getDb } from "./lib/db";
const org = getDb().prepare("SELECT id FROM orgs LIMIT 1").get() as { id: number };
const owner = getDb().prepare("SELECT owner_user_id AS id FROM orgs WHERE id = ?").get(org.id) as { id: number };
// ensure owner is a member (owner is inserted as admin at org creation)
const p = createProgram(org.id, { title: "Deploy Test", milestones: [
  { title: "M1", lessons: [{ title: "L1", kind: "read", content: "Body text." }] }] }, "en", owner.id);
const r = deployProgram({ orgId: org.id, programId: p.id, userIds: [owner.id], assignedBy: owner.id });
console.log(r);
const linked = getDb().prepare("SELECT id, program_id FROM assignments WHERE program_id = ?").all(p.id);
console.log("assignments linked:", linked);
const again = deployProgram({ orgId: org.id, programId: p.id, userIds: [owner.id], assignedBy: owner.id });
console.log("redeploy (expect skipped):", again.skipped);
```

Run: `node --experimental-strip-types /tmp/deploy-check.ts`
Expected: first deploy `{ deployed: 1, skipped: 0, ... }`, an assignment row with `program_id` set, and redeploy `skipped: 1`. Then `rm /tmp/deploy-check.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/org.ts lib/programs.ts
git commit -m "feat(programs): deploy-to-many with per-employee translation pre-enqueue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Program engagement aggregation

**Files:**
- Modify: `lib/programs.ts` — add `programEngagement`.
- Read for reference: `lib/org.ts` (`listAssignments`, `AssignmentProgress`, `progressFor` — reuse the existing per-assignment progress rather than re-deriving metrics).

**Interfaces:**
- Consumes: `listAssignments(orgId)` from `./org` (returns `AssignmentProgress[]` including `program_id`, `read_sec`, `focus_sec`, `exam_best`, `status`).
- Produces:
  - `type ProgramEngagement = { program: Program & { milestone_count: number; lesson_count: number }; deployed: number; started: number; passed: number; overdue: number; avg_read_sec: number; avg_exam_best: number; rows: AssignmentProgress[] }`
  - `programEngagement(orgId: number): ProgramEngagement[]`

- [ ] **Step 1: Add `programEngagement` to `lib/programs.ts`** (add `import { listAssignments, type AssignmentProgress } from "./org";` — `listAssignments` is already exported):

```ts
import { listAssignments, type AssignmentProgress } from "./org";

export type ProgramEngagement = {
  program: Program & { milestone_count: number; lesson_count: number };
  deployed: number;
  started: number;
  passed: number;
  overdue: number;
  avg_read_sec: number;
  avg_exam_best: number;
  rows: AssignmentProgress[];
};

/** Group every program's deployed assignments into an owner-facing engagement summary. */
export function programEngagement(orgId: number): ProgramEngagement[] {
  const programs = listPrograms(orgId);
  const byProgram = new Map<number, AssignmentProgress[]>();
  for (const a of listAssignments(orgId)) {
    if (a.program_id == null) continue;
    const list = byProgram.get(a.program_id) ?? [];
    list.push(a);
    byProgram.set(a.program_id, list);
  }
  return programs.map((program) => {
    const rows = byProgram.get(program.id) ?? [];
    const deployed = rows.length;
    const started = rows.filter((r) => r.status === "in_progress" || r.status === "passed").length;
    const passed = rows.filter((r) => r.status === "passed").length;
    const overdue = rows.filter((r) => r.status === "failed").length;
    const sum = (f: (r: AssignmentProgress) => number) => rows.reduce((n, r) => n + f(r), 0);
    return {
      program,
      deployed,
      started,
      passed,
      overdue,
      avg_read_sec: deployed ? Math.round(sum((r) => r.read_sec) / deployed) : 0,
      avg_exam_best: deployed ? Math.round(sum((r) => r.exam_best) / deployed) : 0,
      rows,
    };
  });
}
```

Note: `AssignmentProgress` must expose `program_id`. It extends `Assignment`, which gains `program_id` in Task 3 Step 1 — confirm `progressFor` in `lib/org.ts` spreads `...refreshed` (it does), so `program_id` flows through automatically.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Functional check** — reuse the deploy scenario; throwaway `/tmp/eng-check.ts`:

```ts
import { programEngagement } from "./lib/programs";
import { getDb } from "./lib/db";
const org = getDb().prepare("SELECT id FROM orgs LIMIT 1").get() as { id: number };
for (const e of programEngagement(org.id))
  console.log(e.program.title, { deployed: e.deployed, passed: e.passed, avg_read_sec: e.avg_read_sec });
```

Run: `node --experimental-strip-types /tmp/eng-check.ts`
Expected: prints each program title with a stats object; the "Deploy Test" program from Task 3 shows `deployed: 1`. Then `rm /tmp/eng-check.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/programs.ts
git commit -m "feat(programs): engagement aggregation grouped by program

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: In-app API routes — library, snapshot, deploy, engagement

**Files:**
- Create: `app/api/orgs/programs/route.ts` (GET list + engagement; POST snapshot-from-goal or create-from-curriculum)
- Create: `app/api/orgs/programs/[id]/route.ts` (GET full; DELETE)
- Create: `app/api/orgs/programs/[id]/deploy/route.ts` (POST deploy-to-many)
- Read for reference: `app/api/orgs/assignments/route.ts` (the `requireAdmin()` pattern + `runtime`/`dynamic` exports), and `node_modules/next/dist/docs/` for this fork's route-handler + dynamic-segment signature **before writing**.

**Interfaces:**
- Consumes: `orgForUser`, `getSessionUser`, `unauthorized` (auth); `listPrograms`, `getProgramFull`, `deleteProgram`, `snapshotGoalToProgram`, `createProgram`, `deployProgram`, `programEngagement` from `lib/programs`; user `language`.
- Produces: JSON endpoints the UI (Task 6) and nothing else depend on.

- [ ] **Step 1: Confirm the fork's route signature.** Read `node_modules/next/dist/docs/` for the dynamic route-handler params shape (e.g. whether the 2nd arg is `{ params }` or `{ params: Promise<...> }`). Match the existing `app/api/orgs/assignments/[id]/route.ts` exactly — open it and copy its handler signature verbatim.

- [ ] **Step 2: Write `app/api/orgs/programs/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser } from "@/lib/org";
import { listPrograms, programEngagement, snapshotGoalToProgram, createProgram } from "@/lib/programs";
import type { CurriculumInput } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  return { user, org: m.org };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ programs: listPrograms(ctx.org.id), engagement: programEngagement(ctx.org.id) });
}

/**
 * Create a program. Two shapes:
 *  - { goalId }               → snapshot an existing (generated + edited) course
 *  - { curriculum: {...} }    → store an authored CurriculumInput directly
 * source_lang defaults to the owner's UI language.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const sourceLang = (ctx.user as { language?: string }).language ?? "en";

  if (body.goalId) {
    const r = snapshotGoalToProgram(Number(body.goalId), ctx.org.id, sourceLang, ctx.user.id);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ programs: listPrograms(ctx.org.id) }, { status: 201 });
  }
  const cur = body.curriculum as CurriculumInput | undefined;
  if (!cur || !cur.title?.toString().trim())
    return NextResponse.json({ error: "Provide a goalId to snapshot, or a curriculum with a title" }, { status: 400 });
  createProgram(ctx.org.id, cur, sourceLang, ctx.user.id);
  return NextResponse.json({ programs: listPrograms(ctx.org.id) }, { status: 201 });
}
```

- [ ] **Step 3: Write `app/api/orgs/programs/[id]/route.ts`** (match the dynamic-segment signature from Step 1 / the existing assignments `[id]` route):

```ts
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser } from "@/lib/org";
import { getProgramFull, deleteProgram, listPrograms } from "@/lib/programs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  return { user, org: m.org };
}

// NOTE: match the 2nd-arg params shape to app/api/orgs/assignments/[id]/route.ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const program = getProgramFull(Number(id));
  if (!program || program.org_id !== ctx.org.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ program });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  deleteProgram(ctx.org.id, Number(id));
  return NextResponse.json({ programs: listPrograms(ctx.org.id) });
}
```

- [ ] **Step 4: Write `app/api/orgs/programs/[id]/deploy/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, listAssignments } from "@/lib/org";
import { deployProgram, programEngagement } from "@/lib/programs";
import { progressJson } from "@/lib/orgApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  return { user, org: m.org };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const userIds = Array.isArray(body.userIds) ? body.userIds.map((n: unknown) => Number(n)).filter(Number.isFinite) : [];
  if (!userIds.length) return NextResponse.json({ error: "Select at least one employee" }, { status: 400 });

  let dueAt: string | null = null;
  if (body.dueAt) {
    const d = new Date(body.dueAt.toString());
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "dueAt must be an ISO date" }, { status: 400 });
    dueAt = d.toISOString();
  }
  const result = deployProgram({
    orgId: ctx.org.id,
    programId: Number(id),
    userIds,
    dueAt,
    note: (body.note ?? "").toString(),
    assignedBy: ctx.user.id,
  });
  return NextResponse.json({
    result,
    engagement: programEngagement(ctx.org.id),
    assignments: listAssignments(ctx.org.id).map(progressJson),
  });
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: build succeeds; the three new routes compile. If the params shape differs in this fork, fix to match `app/api/orgs/assignments/[id]/route.ts`.

- [ ] **Step 6: Functional check** — with `npm run dev` running and logged in as an org admin in the browser, in DevTools console:

```js
await (await fetch("/api/orgs/programs")).json()   // → { programs: [...], engagement: [...] }
```

Expected: returns the programs created earlier + engagement array (no 403). If 403, you're not logged in as an admin of an org.

- [ ] **Step 7: Commit**

```bash
git add app/api/orgs/programs
git commit -m "feat(programs): in-app API — list/engagement, snapshot/create, delete, deploy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Owner UI — Programs tab (library + deploy) and Engagement view

**Files:**
- Modify: `components/app/OrgPanel.tsx` — add a `"programs"` tab; render a new `ProgramsTab`. Add "Save as program" affordance.
- Create: `components/app/ProgramsTab.tsx` — library grid, deploy modal (multi-select employees), engagement summary.
- Read for reference: existing `AssignmentsTab` in `OrgPanel.tsx:415` for form/list/`api()` conventions, glass classes, and the `Member`/`Progress` types.

**Interfaces:**
- Consumes: `GET/POST /api/orgs/programs`, `GET/DELETE /api/orgs/programs/:id`, `POST /api/orgs/programs/:id/deploy`; `api`, `fmtDuration` from `@/lib/client`; `Member` type from `OrgPanel`.
- Produces: no code consumers — terminal UI.

- [ ] **Step 1: Add the tab wiring in `components/app/OrgPanel.tsx`.** Extend the `Tab` type (line 254) and the tab list (line ~262) and the render switch (line ~300):

```ts
type Tab = "assignments" | "programs" | "team" | "branding" | "api";
```

Add to the tab-button array (after `{ id: "assignments", label: "Assignments" }`):

```tsx
{ id: "programs", label: "Programs" },
```

Add to the render switch (after the assignments line):

```tsx
{tab === "programs" && <ProgramsTab members={admin.members} refresh={refresh} />}
```

And add the import at the top of `OrgPanel.tsx`:

```tsx
import ProgramsTab from "@/components/app/ProgramsTab";
```

- [ ] **Step 2: Create `components/app/ProgramsTab.tsx`** with the library, deploy modal, and engagement summary. Mirror the styling of `AssignmentsTab`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { api, fmtDuration } from "@/lib/client";

type Member = { user_id: number; email: string; display_name: string; role: string };
type ProgramRow = {
  id: number; title: string; description: string; source_lang: string;
  milestone_count: number; lesson_count: number; created_at: string;
};
type Engagement = {
  program: ProgramRow;
  deployed: number; started: number; passed: number; overdue: number;
  avg_read_sec: number; avg_exam_best: number;
  rows: { id: number; employee_name: string; employee_email: string; status: string; read_sec: number; exam_best: number }[];
};

export default function ProgramsTab({ members, refresh }: { members: Member[]; refresh: () => void }) {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [engagement, setEngagement] = useState<Engagement[]>([]);
  const [deployFor, setDeployFor] = useState<ProgramRow | null>(null);
  const [openEng, setOpenEng] = useState<number | null>(null);

  const load = async () => {
    const d = await api<{ programs: ProgramRow[]; engagement: Engagement[] }>("/api/orgs/programs");
    setPrograms(d.programs);
    setEngagement(d.engagement);
  };
  useEffect(() => {
    load().catch(() => {});
  }, []);

  const engFor = (id: number) => engagement.find((e) => e.program.id === id);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted">
        Author a course once, then deploy it to your whole team at once. Each employee studies it in
        their own language; you review and monitor it in yours.
      </p>

      {programs.length === 0 && (
        <div className="rounded-[16px] border border-line bg-white/50 p-4 text-[13px] text-muted">
          No programs yet. Build a course under <span className="font-semibold text-ink">Goals</span>,
          then use <span className="font-semibold text-ink">“Save as program”</span> on its page to add
          it to your library.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {programs.map((p) => {
          const e = engFor(p.id);
          return (
            <div key={p.id} className="flex flex-col gap-2 rounded-[16px] border border-line bg-white/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{p.title}</p>
                  <p className="text-[11.5px] text-muted">
                    {p.milestone_count} milestones · {p.lesson_count} sections · source {p.source_lang.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => setDeployFor(p)}
                  className="glassx-dark shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold text-white"
                >
                  Deploy
                </button>
              </div>
              {e && e.deployed > 0 && (
                <button
                  onClick={() => setOpenEng(openEng === p.id ? null : p.id)}
                  className="mt-1 rounded-[12px] bg-white/70 px-3 py-2 text-left text-[12px] text-ink"
                >
                  {e.deployed} deployed · {e.passed} passed · {e.overdue} overdue · avg read{" "}
                  {fmtDuration(e.avg_read_sec)} · avg exam {e.avg_exam_best}%
                </button>
              )}
              {openEng === p.id && e && (
                <div className="flex flex-col gap-1">
                  {e.rows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-[10px] bg-white/60 px-3 py-1.5 text-[11.5px]">
                      <span className="truncate text-ink">{r.employee_name || r.employee_email}</span>
                      <span className="text-muted">
                        {r.status} · {fmtDuration(r.read_sec)} · {r.exam_best}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={async () => {
                    if (!confirm(`Delete “${p.title}” from the library? Employees keep any course already assigned.`)) return;
                    await api(`/api/orgs/programs/${p.id}`, { method: "DELETE" }).catch(() => {});
                    load();
                    refresh();
                  }}
                  className="text-[11px] text-muted hover:text-accent"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {deployFor && (
        <DeployModal
          program={deployFor}
          members={members.filter((m) => m.role !== "admin").concat(members.filter((m) => m.role === "admin"))}
          onClose={() => setDeployFor(null)}
          onDone={() => {
            setDeployFor(null);
            load();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DeployModal({
  program,
  members,
  onClose,
  onDone,
}: {
  program: ProgramRow;
  members: Member[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allOn = picked.size === members.length && members.length > 0;

  const deploy = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ result: { deployed: number; skipped: number } }>(
        `/api/orgs/programs/${program.id}/deploy`,
        { method: "POST", body: JSON.stringify({ userIds: [...picked], dueAt: dueAt || null, note }) },
      );
      setMsg(`Deployed to ${r.result.deployed}${r.result.skipped ? `, skipped ${r.result.skipped} already assigned` : ""}.`);
      setTimeout(onDone, 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-[520px] flex-col gap-3 overflow-auto rounded-[20px] border border-line bg-white p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 className="font-display text-[16px] font-extrabold uppercase text-ink">Deploy “{program.title}”</h3>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">Choose employees</span>
          <button
            onClick={() => setPicked(allOn ? new Set() : new Set(members.map((m) => m.user_id)))}
            className="text-[12px] font-semibold text-accent"
          >
            {allOn ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {members.map((m) => (
            <label key={m.user_id} className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-white/70 px-3 py-2 text-[13px]">
              <input type="checkbox" checked={picked.has(m.user_id)} onChange={() => toggle(m.user_id)} />
              <span className="text-ink">{m.display_name}</span>
              <span className="text-muted">— {m.email}</span>
            </label>
          ))}
        </div>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note employees see"
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        {err && <p className="text-[12px] text-accent">{err}</p>}
        {msg && <p className="text-[12px] text-ink">{msg}</p>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="glassx rounded-full px-4 py-2 text-[13px] text-ink">Cancel</button>
          <button
            onClick={deploy}
            disabled={busy || !picked.size}
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Deploying…" : `Deploy to ${picked.size || 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the "Save as program" entry point** on the goal/course page. Find the goal page (`app/app/goals/[id]/page.tsx` and its course component). Add a button, admin-only, that POSTs the current goal as a program:

```tsx
// in the course header actions, shown only when the viewer is an org admin:
<button
  onClick={async () => {
    await api("/api/orgs/programs", { method: "POST", body: JSON.stringify({ goalId }) }).catch(() => {});
    alert("Saved to your company's program library.");
  }}
  className="glassx rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink"
>
  Save as program
</button>
```

To know whether to show it, reuse whatever the goal page already knows about the user; if org-admin status isn't available there, gate the button behind a cheap `GET /api/orgs/programs` probe (200 = admin) or add an `isOrgAdmin` flag to the goal page's server props via `orgForUser(user.id)?.role === "admin"`. Prefer adding the server-side flag — it avoids a probe request.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds; `ProgramsTab` and the modified `OrgPanel`/goal page compile.

- [ ] **Step 5: Functional check** — `npm run dev`, log in as an org admin, open `/app/org`:
  1. The **Programs** tab appears. With no programs it shows the empty-state hint.
  2. Open a course under Goals, click **Save as program** → it appears in the Programs tab.
  3. Click **Deploy**, select employees, Deploy → success message; the card shows deployed/passed counts.
  4. Deploy again to the same person → "skipped N already assigned".

- [ ] **Step 6: Commit**

```bash
git add components/app/OrgPanel.tsx components/app/ProgramsTab.tsx app/app/goals
git commit -m "feat(programs): owner UI — Programs tab, deploy modal, engagement, Save as program

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Partner API + MCP parity — author programs externally

**Files:**
- Create: `app/api/v1/programs/route.ts` (GET list, POST create-from-curriculum)
- Modify: `app/api/mcp/route.ts` (or wherever MCP tools are registered — locate with `grep -rl "tools" app/api/mcp`) to add `list_programs`, `create_program`, `deploy_program` tools.
- Modify: `lib/orgApi.ts` — add `buildProgram(org, input)` and program serializers, reusing the same validation shape as `buildAssignment`.
- Read for reference: `app/api/v1/*` existing partner routes (auth via `orgFromRequest`), and the existing MCP tool registrations.

**Interfaces:**
- Consumes: `orgFromRequest` from `lib/orgApi`; `createProgram`, `listPrograms`, `deployProgram` from `lib/programs`; `getUserByEmail` from `lib/repo`.
- Produces: `buildProgram(org: Org, input: { title?: string; description?: string; milestones?: unknown; sourceLang?: string }): { program: Program } | { error: string }`; `programJson(p)` serializer.

- [ ] **Step 1: Add `buildProgram` + `programJson` to `lib/orgApi.ts`**, reusing the milestone/lesson parsing already written in `buildAssignment` (lines 78–100). Extract that parsing into a shared helper `parseCurriculum(input): CurriculumInput | { error: string }` and call it from both `buildAssignment` and `buildProgram`:

```ts
import { createProgram, type Program } from "./programs";
import { isSupported, DEFAULT_LANG } from "./languages";

/** Shared curriculum parser — used by both buildAssignment and buildProgram. */
export function parseCurriculum(input: AssignInput): CurriculumInput | { error: string } {
  const title = (input.title ?? "").toString().trim();
  if (!title) return { error: "Title is required" };
  const curriculum: CurriculumInput = { title, description: (input.description ?? "").toString() };
  if (Array.isArray(input.milestones)) {
    curriculum.milestones = [];
    for (const raw of input.milestones as Record<string, unknown>[]) {
      const mTitle = (raw?.title ?? "").toString().trim();
      if (!mTitle) return { error: "Every milestone needs a title" };
      const lessons = Array.isArray(raw.lessons)
        ? (raw.lessons as Record<string, unknown>[]).map((l) => ({
            title: (l?.title ?? "").toString().trim(),
            objective: (l?.objective ?? "").toString(),
            kind: KINDS.includes(l?.kind as LessonKind) ? (l!.kind as LessonKind) : ("read" as LessonKind),
            content: typeof l?.content === "string" ? l.content : undefined,
          }))
        : [];
      if (lessons.some((l) => !l.title)) return { error: "Every lesson needs a title" };
      curriculum.milestones.push({
        title: mTitle,
        detail: (raw.detail ?? "").toString(),
        estimate: (raw.estimate ?? "").toString(),
        lessons,
      });
    }
  }
  return curriculum;
}

export function buildProgram(
  org: Org,
  input: AssignInput & { sourceLang?: string },
): { program: Program } | { error: string } {
  const cur = parseCurriculum(input);
  if ("error" in cur) return cur;
  const lang = input.sourceLang && isSupported(input.sourceLang) ? input.sourceLang : DEFAULT_LANG;
  return { program: createProgram(org.id, cur, lang, null) };
}

export const programJson = (p: Program) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  sourceLang: p.source_lang,
  createdAt: p.created_at,
});
```

Then refactor `buildAssignment` to call `parseCurriculum` instead of duplicating the parse (replace lines 68–100 with a `const cur = parseCurriculum(input); if ("error" in cur) return cur;` and use `cur` as the curriculum, preserving the `dueAt`/employee resolution around it).

- [ ] **Step 2: Write `app/api/v1/programs/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { orgFromRequest, buildProgram, programJson } from "@/lib/orgApi";
import { listPrograms } from "@/lib/programs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  return NextResponse.json({ programs: listPrograms(org.id) });
}

export async function POST(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const r = buildProgram(org, body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ program: programJson(r.program) }, { status: 201 });
}
```

- [ ] **Step 3: Register MCP tools.** Locate the MCP tool list (`grep -rn "name:\|tools" app/api/mcp`), and add three tools mirroring existing ones: `list_programs` (→ `listPrograms(org.id)`), `create_program` (→ `buildProgram(org, args)`), `deploy_program` (args: `programId`, `emails[]` → resolve via `getUserByEmail` to userIds, then `deployProgram`). Follow the exact registration shape already used for the assignment tools in that file.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds; `buildAssignment` still behaves (parse extracted, not changed in meaning).

- [ ] **Step 5: Functional check** — with `npm run dev` and a real org API key (from the org's API tab):

```bash
KEY=abr_org_...   # from /app/org → API tab
curl -s -X POST localhost:3000/api/v1/programs -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"title":"API Program","milestones":[{"title":"M1","lessons":[{"title":"L1","kind":"read","content":"hi"}]}]}'
curl -s localhost:3000/api/v1/programs -H "Authorization: Bearer $KEY"
```

Expected: POST returns `{ program: { id, title: "API Program", ... } }`; GET lists it. Confirm it also shows in the in-app Programs tab.

- [ ] **Step 6: Commit**

```bash
git add lib/orgApi.ts app/api/v1/programs app/api/mcp
git commit -m "feat(programs): partner API + MCP parity (list/create/deploy) via shared parser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Reusable program library → Tasks 1, 2 (tables + CRUD + snapshot).
- Bulk deploy to many → Task 3 (`deployProgram`) + Task 6 (multi-select modal).
- Author-once, auto-localize → Task 3 (pre-enqueue translations keyed to employee language; source-lang skip).
- Monitor in your language → Task 4 (engagement) + Task 6 (owner-language dashboard; source content reviewed) .
- In-app authoring (Both) → Task 6 "Save as program" reuses the existing generation + editor; API/MCP → Task 7.
- `ON DELETE SET NULL` isolation → Task 1.
- Out-of-scope items (free-text answer translation, program versioning) → intentionally omitted.

**Placeholder scan:** MCP registration (Task 7 Step 3) and the goal-page admin flag (Task 6 Step 3) are described procedurally because they must match unseen local conventions in this Next.js fork — each names the exact function to call, the file to open, and the existing pattern to copy. All library/route code is complete.

**Type consistency:** `program_id` added to `Assignment` (Task 3) flows into `AssignmentProgress` via `progressFor`'s spread, which Task 4 relies on. `CurriculumInput` (from `lib/org.ts`) is the single interchange type across snapshot, create, deploy, and API. `parseCurriculum` (Task 7) is the shared parser feeding both `buildAssignment` and `buildProgram`. `createAssignment` gains `programId?: number | null` (Task 3) consumed by `deployProgram` (Task 3).

## Open question for David (does not block build)

Deploy currently localizes to each **employee's own settings language**. If instead you want to pick a **target language per deploy** ("send this cohort the Spanish version"), that's a one-field addition to `DeployModal` + `deployProgram` (translate to a chosen `lang` rather than each user's). Flag it and it's a 15-minute follow-up.
