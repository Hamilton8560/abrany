# Self-Running Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-enroll completed lessons into spaced review (opt-out) and make every review a recall-first, "in your own words" test, with a legible review section.

**Architecture:** SRS state already lives as columns on `lessons` (`srs_due` NULL = not enrolled). We add an `srs_optout` flag and an `autoEnrollLesson` repo function wired into the lesson-completion PATCH route so finishing a lesson schedules its first review for tomorrow. The review card is reordered to demand free recall before revealing the answer; recall attempts are graded by reusing the existing `gradeReviewQuiz` and persisted to a new `review_log` table. The `/app/review` page and `/api/reviews` payload grow "coming up" and "your rotation" views.

**Tech Stack:** Next.js 16 (App Router, `RouteContext` typed routes), React 19, `node:sqlite` (`DatabaseSync`), Node's built-in `node:test` runner (Node 25 — native TypeScript, zero test deps).

## Global Constraints

- Node's built-in SQLite only (`node:sqlite`, `DatabaseSync`) — no new DB dependency.
- Schema changes go through the `addCol(table, col, def)` helper or `CREATE TABLE IF NOT EXISTS` inside `migrate()` in `lib/db.ts` — additive migrations only, never destructive.
- Route handlers: `runtime = "nodejs"`, `dynamic = "force-dynamic"`; auth via `getSessionUser()` → `unauthorized()` / `forbidden()`; ownership via `userOwnsLesson(user.id, lessonId)`.
- All new user-facing copy stays in the app's existing voice (lowercase-ish, terse, coach-tone). Example strings are given verbatim below — use them.
- Free-tier reviews cost zero LLM calls; AI grading is on-demand only (reuses `/api/lessons/[id]/grade`).
- No retroactive enrollment of lessons completed before this ships.
- Spec: `docs/superpowers/specs/2026-07-23-auto-enroll-recall-reviews-design.md`. Decision: `docs/decisions/0019-auto-enroll-recall-reviews.md`.

---

### Task 1: Test harness (zero-dependency `node:test`)

The repo currently has no test runner. Add one with no new dependencies, plus a DB-isolation
helper and a lesson fixture, proven by a smoke test.

**Files:**
- Modify: `package.json` (add `test` script)
- Create: `tests/setup.ts` (isolate the SQLite file per test process)
- Create: `tests/helpers/fixtures.ts` (seed a user→goal→plan→lesson chain)
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `seedReadyLesson({ ready?: boolean }): { user, goal, planItem, lesson }` from
  `tests/helpers/fixtures.ts` — later tasks import this to build test data.
- Produces: importing `tests/setup.ts` **first** in any test file points `DATA_DIR` at a fresh temp
  directory before `lib/db.ts` evaluates, giving each test file its own database.

- [ ] **Step 1: Add the test script**

In `package.json`, add to `"scripts"`:

```json
    "test": "node --test"
```

(Node's runner auto-discovers `**/*.test.ts`, excludes `node_modules`, and strips TS types natively on Node 25.)

- [ ] **Step 2: Write the DB-isolation setup module**

Create `tests/setup.ts`:

```ts
// Imported FIRST in every test file. ES modules evaluate in import-source order, so setting
// DATA_DIR here runs before lib/db.ts is evaluated (its DB_PATH const reads DATA_DIR at import).
// `node --test` runs each test file in its own process, so each file gets a fresh database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "abrany-test-"));
```

- [ ] **Step 3: Write the fixture helper**

Create `tests/helpers/fixtures.ts`:

```ts
import "../setup.ts"; // MUST be first — sets DATA_DIR before lib modules load
import {
  createUser,
  createGoal,
  createPlan,
  createLessonStubs,
  setLessonContent,
  type Lesson,
} from "../../lib/repo.ts";

let counter = 0;

/** Seed one isolated user → goal → plan → milestone → lesson. `ready` gives it content+status. */
export function seedReadyLesson({ ready = true }: { ready?: boolean } = {}): {
  userId: number;
  goalId: number;
  planItemId: number;
  lesson: Lesson;
} {
  const i = ++counter;
  const user = createUser(`test${i}@example.com`, "hash");
  const goal = createGoal(user.id, `Goal ${i}`);
  const plan = createPlan(goal.id, `Plan ${i}`, "summary", [{ title: `Milestone ${i}` }]);
  const planItem = plan.items[0];
  const [lesson] = createLessonStubs(planItem.id, [
    { title: `Lesson ${i}`, objective: "Recall the key idea." },
  ]);
  if (ready) setLessonContent(lesson.id, "# Body\nThe content of the lesson.");
  return { userId: user.id, goalId: goal.id, planItemId: planItem.id, lesson };
}
```

- [ ] **Step 4: Write the smoke test**

Create `tests/smoke.test.ts`:

```ts
import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import { getLesson } from "../lib/repo.ts";

test("fixture seeds a ready lesson", () => {
  const { lesson } = seedReadyLesson();
  const row = getLesson(lesson.id);
  assert.equal(row?.status, "ready");
  assert.equal(row?.srs_due, null); // not enrolled yet
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `# pass 1` (the smoke test passes; a fresh temp DB is created and migrated).

- [ ] **Step 6: Commit**

```bash
git add package.json tests/setup.ts tests/helpers/fixtures.ts tests/smoke.test.ts
git commit -m "test: add node:test harness with isolated-db fixture"
```

---

### Task 2: Opt-out column + auto-enroll enrollment logic

Add the `srs_optout` flag and the gated `autoEnrollLesson`, and make manual enroll/unenroll manage the flag.

**Files:**
- Modify: `lib/db.ts:359` (add `srs_optout` addCol after the SRS columns)
- Modify: `lib/repo.ts:400-420` (add `srs_optout` to the `Lesson` type)
- Modify: `lib/repo.ts:1318-1330` (`enrollLesson`, `unenrollLesson`) and add `autoEnrollLesson`
- Test: `tests/enroll.test.ts`

**Interfaces:**
- Consumes: `seedReadyLesson` (Task 1); `getLesson`, `setLessonStatus` from `lib/repo.ts`.
- Produces:
  - `autoEnrollLesson(id: number): { enrolled: boolean }` — enrolls only when the lesson is
    `status='ready'`, `srs_due IS NULL`, and `srs_optout = 0`; sets `srs_due` = tomorrow,
    `srs_interval = 1`, `srs_ease = 2.3`, `srs_reps = 0`. Returns `{ enrolled }`.
  - `enrollLesson(id)` now also sets `srs_optout = 0` (due today, manual).
  - `unenrollLesson(id)` now also sets `srs_optout = 1`.
  - `Lesson.srs_optout: number` (0/1).

- [ ] **Step 1: Write failing tests**

Create `tests/enroll.test.ts`:

```ts
import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import {
  autoEnrollLesson,
  enrollLesson,
  unenrollLesson,
  getLesson,
  setLessonStatus,
} from "../lib/repo.ts";

test("autoEnroll schedules a ready lesson for tomorrow", () => {
  const { lesson } = seedReadyLesson();
  const res = autoEnrollLesson(lesson.id);
  assert.equal(res.enrolled, true);
  const row = getLesson(lesson.id)!;
  assert.notEqual(row.srs_due, null);
  assert.equal(row.srs_due! > new Date().toISOString().slice(0, 10), true); // strictly after today
  assert.equal(row.srs_interval, 1);
  assert.equal(row.srs_reps, 0);
});

test("autoEnroll skips a lesson without ready content", () => {
  const { lesson } = seedReadyLesson({ ready: false });
  setLessonStatus(lesson.id, "stub");
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false);
  assert.equal(getLesson(lesson.id)!.srs_due, null);
});

test("autoEnroll respects a prior opt-out", () => {
  const { lesson } = seedReadyLesson();
  unenrollLesson(lesson.id); // user removed it: sets optout
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false);
  assert.equal(getLesson(lesson.id)!.srs_due, null);
});

test("autoEnroll is idempotent once enrolled", () => {
  const { lesson } = seedReadyLesson();
  autoEnrollLesson(lesson.id);
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false); // already enrolled
});

test("manual enroll clears opt-out and is due today", () => {
  const { lesson } = seedReadyLesson();
  unenrollLesson(lesson.id);
  enrollLesson(lesson.id);
  const row = getLesson(lesson.id)!;
  assert.equal(row.srs_optout, 0);
  assert.equal(row.srs_due, new Date().toISOString().slice(0, 10)); // date('now')
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `autoEnrollLesson` is not exported / `srs_optout` undefined.

- [ ] **Step 3: Add the column**

In `lib/db.ts`, immediately after line 359 (`addCol("lessons", "srs_last", ...)`):

```ts
  addCol("lessons", "srs_optout", "srs_optout INTEGER NOT NULL DEFAULT 0");
```

- [ ] **Step 4: Add `srs_optout` to the Lesson type**

In `lib/repo.ts`, in the `Lesson` type (after `srs_last: string | null;`):

```ts
  srs_optout: number; // 1 = user removed it from reviews; auto-enroll skips it
```

- [ ] **Step 5: Implement the enrollment functions**

In `lib/repo.ts`, replace `enrollLesson` and `unenrollLesson` (currently `1318-1330`) with:

```ts
/** Enroll a lesson in spaced review — due today, fresh SM-2 state, opt-out cleared. Manual. */
export function enrollLesson(id: number): Lesson | undefined {
  getDb()
    .prepare(
      `UPDATE lessons SET srs_due = date('now'), srs_interval = 0, srs_ease = 2.3, srs_reps = 0,
       srs_optout = 0, updated_at = datetime('now') WHERE id = ? AND srs_due IS NULL`,
    )
    .run(id);
  return getLesson(id);
}

/** Remove a lesson from reviews and remember the opt-out so auto-enroll won't re-add it. */
export function unenrollLesson(id: number): void {
  getDb()
    .prepare("UPDATE lessons SET srs_due = NULL, srs_optout = 1 WHERE id = ?")
    .run(id);
}

/**
 * Auto-enroll on lesson completion: only for ready, not-opted-out, not-already-enrolled lessons.
 * First review is scheduled for tomorrow (interval 1) — recall the day after learning, not the
 * same day. Idempotent; never throws for a missing row.
 */
export function autoEnrollLesson(id: number): { enrolled: boolean } {
  const info = getDb()
    .prepare(
      `UPDATE lessons SET srs_due = date('now', '+1 day'), srs_interval = 1, srs_ease = 2.3,
       srs_reps = 0, updated_at = datetime('now')
       WHERE id = ? AND srs_due IS NULL AND srs_optout = 0 AND status = 'ready'`,
    )
    .run(id);
  return { enrolled: info.changes > 0 };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all enroll tests green.

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts lib/repo.ts tests/enroll.test.ts
git commit -m "feat(reviews): srs_optout flag + autoEnrollLesson (tomorrow, opt-out aware)"
```

---

### Task 3: Wire auto-enroll into lesson completion + toast

Finishing a lesson calls `autoEnrollLesson`; the response tells the client, which shows a toast.

**Files:**
- Modify: `app/api/lessons/[id]/route.ts:19-34` (PATCH — call `autoEnrollLesson` on `done:true`, return `enrolled`)
- Modify: `components/app/MilestoneLessons.tsx:42-56` (`setDone` — read `enrolled`, show toast) and add a minimal toast element
- Test: `tests/enroll.test.ts` (extend with the completion-gating behavior at repo level)

**Interfaces:**
- Consumes: `autoEnrollLesson` (Task 2); `setLessonCompleted`, `getLesson` (`lib/repo.ts`).
- Produces: `PATCH /api/lessons/[id]` response shape `{ lesson, enrolled?: boolean }` — `enrolled`
  is `true` only on the transition that actually enrolled.

- [ ] **Step 1: Write the failing test (repo-level gating the route depends on)**

Append to `tests/enroll.test.ts`:

```ts
test("completing then autoEnrolling a ready lesson enrolls exactly once", () => {
  const { lesson } = seedReadyLesson();
  assert.equal(autoEnrollLesson(lesson.id).enrolled, true); // first completion
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false); // unchecking + re-checking won't re-add
});
```

- [ ] **Step 2: Run to verify it passes at repo level**

Run: `npm test`
Expected: PASS (this pins the behavior the route relies on; it already passes given Task 2).

- [ ] **Step 3: Wire the PATCH route**

In `app/api/lessons/[id]/route.ts`, update imports and the PATCH handler:

```ts
import { getLesson, setLessonCompleted, updateLessonFields, deleteLesson, userOwnsLesson, autoEnrollLesson } from "@/lib/repo";
```

Replace the body after the `updateLessonFields` block (lines `31-33`) with:

```ts
  let enrolled = false;
  if (body.done !== undefined) {
    const updated = setLessonCompleted(Number(id), !!body.done);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.done === true) enrolled = autoEnrollLesson(Number(id)).enrolled;
    return NextResponse.json({ lesson: updated, enrolled });
  }
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
```

- [ ] **Step 4: Show the toast in the client**

In `components/app/MilestoneLessons.tsx`, add toast state to the `MilestoneLessons` component (near the other `useState` calls, ~line 38):

```tsx
  const [toast, setToast] = useState<string | null>(null);
```

Change the `setDone` callback (lines `42-56`) so it reads `enrolled` from the response:

```tsx
  const setDone = useCallback(
    async (lesson: Lesson, done: boolean) => {
      setLessons((ls) =>
        ls?.map((l) => (l.id === lesson.id ? { ...l, completed_at: done ? new Date().toISOString() : null } : l)) ?? ls,
      );
      setViewing((v) => (v && v.id === lesson.id ? { ...v, completed_at: done ? new Date().toISOString() : null } : v));
      try {
        const res = await api<{ lesson: Lesson; enrolled?: boolean }>(
          `/api/lessons/${lesson.id}`,
          { method: "PATCH", body: JSON.stringify({ done }) },
        );
        if (res.enrolled) {
          setToast("✓ Added to your reviews — first check-in tomorrow.");
          setTimeout(() => setToast(null), 4000);
        }
        onProgress?.();
      } catch {
        setLessons((ls) => ls?.map((l) => (l.id === lesson.id ? { ...l, completed_at: lesson.completed_at } : l)) ?? ls);
      }
    },
    [onProgress],
  );
```

Add the toast element just before the final closing `</div>` of the component's returned JSX (after the `{viewing && (...)}` block, ~line 263):

```tsx
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
```

- [ ] **Step 5: Verify in the app (manual)**

Run: `npm run dev`, open a goal, expand a milestone, open a `ready` lesson, click **"Mark section complete"**.
Expected: the toast *"✓ Added to your reviews — first check-in tomorrow."* appears; re-opening the lesson viewer shows **"✓ In reviews"**; unchecking/rechecking "done" does NOT show the toast again.

- [ ] **Step 6: Commit**

```bash
git add app/api/lessons/[id]/route.ts components/app/MilestoneLessons.tsx tests/enroll.test.ts
git commit -m "feat(reviews): auto-enroll on lesson completion + confirmation toast"
```

---

### Task 4: `review_log` table + recall persistence functions

Persist each graded recall attempt so learners accumulate a record of their own explanations.

**Files:**
- Modify: `lib/db.ts` inside `migrate()` (add `CREATE TABLE IF NOT EXISTS review_log`)
- Modify: `lib/repo.ts` (add `logReview`, `recentRecall`, and the `ReviewLogEntry` type near the SRS section ~`1315`)
- Test: `tests/reviewLog.test.ts`

**Interfaces:**
- Consumes: `seedReadyLesson` (Task 1).
- Produces:
  - `type ReviewLogEntry = { id: number; lesson_id: number; user_id: number; recall_text: string; rating: string; verdict: string; created_at: string }`
  - `logReview(args: { lessonId: number; userId: number; recallText: string; rating: string; verdict?: string }): void`
  - `recentRecall(lessonId: number, limit?: number): ReviewLogEntry[]` — newest first.

- [ ] **Step 1: Write failing tests**

Create `tests/reviewLog.test.ts`:

```ts
import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import { logReview, recentRecall } from "../lib/repo.ts";

test("logReview persists and recentRecall returns newest first", () => {
  const { lesson, userId } = seedReadyLesson();
  logReview({ lessonId: lesson.id, userId, recallText: "first try", rating: "hard", verdict: "partial" });
  logReview({ lessonId: lesson.id, userId, recallText: "second try", rating: "good", verdict: "correct" });
  const log = recentRecall(lesson.id);
  assert.equal(log.length, 2);
  assert.equal(log[0].recall_text, "second try");
  assert.equal(log[0].rating, "good");
  assert.equal(log[1].recall_text, "first try");
});

test("verdict defaults to empty string when omitted", () => {
  const { lesson, userId } = seedReadyLesson();
  logReview({ lessonId: lesson.id, userId, recallText: "no ai grade", rating: "easy" });
  assert.equal(recentRecall(lesson.id)[0].verdict, "");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `logReview` not exported.

- [ ] **Step 3: Create the table**

In `lib/db.ts`, inside `migrate()` (after the existing `CREATE TABLE IF NOT EXISTS` blocks, before the `addCol` section is fine), add:

```ts
    CREATE TABLE IF NOT EXISTS review_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recall_text TEXT NOT NULL DEFAULT '',
      rating      TEXT NOT NULL DEFAULT '',
      verdict     TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

(Place it as another statement inside the same `db.exec(\`...\`)` template that holds the other `CREATE TABLE` statements.)

- [ ] **Step 4: Implement the repo functions**

In `lib/repo.ts`, in the spaced-repetition section (near line `1315`), add:

```ts
export type ReviewLogEntry = {
  id: number;
  lesson_id: number;
  user_id: number;
  recall_text: string;
  rating: string;
  verdict: string;
  created_at: string;
};

/** Record one recall attempt (the learner's own words + the rating it earned). */
export function logReview(args: {
  lessonId: number;
  userId: number;
  recallText: string;
  rating: string;
  verdict?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO review_log (lesson_id, user_id, recall_text, rating, verdict)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(args.lessonId, args.userId, args.recallText, args.rating, args.verdict ?? "");
}

/** A lesson's recent recall attempts, newest first. */
export function recentRecall(lessonId: number, limit = 5): ReviewLogEntry[] {
  return getDb()
    .prepare("SELECT * FROM review_log WHERE lesson_id = ? ORDER BY id DESC LIMIT ?")
    .all(lessonId, limit) as ReviewLogEntry[];
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/repo.ts tests/reviewLog.test.ts
git commit -m "feat(reviews): review_log table + logReview/recentRecall"
```

---

### Task 5: Recall-first review card + persisted recall

Reorder the review card so free recall comes before reveal, add "Grade my recall" (reusing the AI grader), and persist the attempt when the learner rates it.

**Files:**
- Modify: `app/api/reviews/[id]/route.ts` (accept `recall_text` + `verdict`, call `logReview`)
- Modify: `app/app/review/page.tsx` (recall textarea first; grade-my-recall; send recall on rate)
- Modify: `components/app/ReviewQuiz.tsx:26-73` (accept an optional seeded free-recall answer so "Grade my recall" grades their paragraph)

**Interfaces:**
- Consumes: `logReview` (Task 4); `saveReview`, `getLesson`, `userOwnsLesson` (`lib/repo.ts`);
  `POST /api/lessons/[id]/grade` (existing, returns `{ grade: { results, summary, suggested } }`).
- Produces: `POST /api/reviews/[id]` accepts `{ rating, recall_text?, verdict? }`; on success it
  reschedules (SM-2) AND appends to `review_log`.

- [ ] **Step 1: Extend the reviews grade route to persist recall**

In `app/api/reviews/[id]/route.ts`, add the import:

```ts
import { getLesson, saveReview, userOwnsLesson, logReview } from "@/lib/repo";
```

After `saveReview(lesson.id, next);` (line `30`), before the return, add:

```ts
  const recallText = typeof body.recall_text === "string" ? body.recall_text : "";
  const verdict = typeof body.verdict === "string" ? body.verdict : "";
  if (recallText) logReview({ lessonId: lesson.id, userId: user.id, recallText, rating, verdict });
```

- [ ] **Step 2: Make ReviewQuiz gradable from a free-recall paragraph**

In `components/app/ReviewQuiz.tsx`, add a `recall` prop and a mode that grades the learner's own
paragraph instead of generating fresh questions. Change the component signature (line `26`):

```tsx
export default function ReviewQuiz({
  lessonId,
  objective,
  recall,
  onSuggest,
  onVerdict,
}: {
  lessonId: number;
  objective: string;
  recall: string;
  onSuggest: (r: Rating) => void;
  onVerdict?: (v: Verdict) => void;
}) {
```

Replace the question-generation `useEffect` (lines `42-55`) with a single grade call over the
learner's recall text:

```tsx
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const question = objective || "Explain what you learned in this lesson.";
    api<{ grade: Grade }>(`/api/lessons/${lessonId}/grade`, {
      method: "POST",
      body: JSON.stringify({ items: [{ question, answer: recall }] }),
    })
      .then((d) => {
        setGrade(d.grade);
        setPhase("done");
        onSuggest(d.grade.suggested);
        onVerdict?.(d.grade.results[0]?.verdict ?? "partial");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Coach is unavailable");
        setPhase("error");
      });
  }, [lessonId, objective, recall, onSuggest, onVerdict]);
```

Remove the now-unused `answering`/`submit`/`questions`/`answers` machinery and the textarea/submit
JSX (lines `36-40`, `57-73`, `89-135`), keeping only the `loading`, `error`, and `done` renders
(the "Coach's take" summary block at `136-146`). The `loading` copy becomes:

```tsx
  if (phase === "loading")
    return (
      <div className="mt-4 rounded-[14px] border border-line bg-white/40 px-4 py-6 text-center text-[13px] text-muted">
        Your coach is checking your recall… <span className="text-[11px]">(queued through MiniMax)</span>
      </div>
    );
```

- [ ] **Step 3: Reorder the review card to recall-first**

In `app/app/review/page.tsx`, add recall state near the other `useState` calls (line `28`):

```tsx
  const [recall, setRecall] = useState("");
  const [verdict, setVerdict] = useState<string | null>(null);
```

Reset them in `resetCard` (lines `30-34`):

```tsx
  const resetCard = () => {
    setRevealed(false);
    setQuizzing(false);
    setSuggested(null);
    setRecall("");
    setVerdict(null);
  };
```

Send the recall + verdict when grading (the `grade` function, lines `50-63`):

```tsx
  const grade = async (rating: Rating) => {
    if (!current || grading) return;
    setGrading(true);
    try {
      await api(`/api/reviews/${current.id}`, {
        method: "POST",
        body: JSON.stringify({ rating, recall_text: recall, verdict: verdict ?? undefined }),
      });
      resetCard();
      setI((n) => n + 1);
    } finally {
      setGrading(false);
    }
  };
```

Replace the "Try to recall" cue + action buttons block (lines `128-160`) with a recall-first layout:

```tsx
          <div className="mt-4 rounded-[14px] bg-white/55 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              From memory — no peeking
            </p>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">
              {current.objective || "Explain what you learned in this lesson, in your own words."}
            </p>
            <textarea
              value={recall}
              onChange={(e) => setRecall(e.target.value)}
              rows={4}
              placeholder="Write what you remember…"
              className="mt-3 w-full resize-none rounded-[12px] border border-line bg-white/70 px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setRevealed((v) => !v)}
              className="glassx rounded-full px-4 py-2 text-[13px] font-semibold text-ink"
            >
              {revealed ? "Hide lesson" : "Reveal & self-rate"}
            </button>
            {!quizzing && (
              <button
                onClick={() => setQuizzing(true)}
                disabled={!recall.trim()}
                title={recall.trim() ? "Have your coach grade your recall" : "Write your recall first"}
                className="glassx-dark rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Grade my recall
              </button>
            )}
          </div>

          {revealed && (
            <div className="mt-3 max-h-[42vh] overflow-y-auto rounded-[14px] border border-line bg-white/40 p-4">
              <Markdown>{current.content}</Markdown>
            </div>
          )}

          {quizzing && (
            <ReviewQuiz
              key={current.id}
              lessonId={current.id}
              objective={current.objective}
              recall={recall}
              onSuggest={setSuggested}
              onVerdict={setVerdict}
            />
          )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (props on `ReviewQuiz` match the new signature; `verdict` typed as `string | null`).

- [ ] **Step 5: Verify in the app (manual)**

Run: `npm run dev`, complete a lesson, then (using a lesson whose `srs_due` you set to today via
`enrollLesson` in a REPL, or wait a day) open `/app/review`.
Expected: the card opens with a blank recall box; **Grade my recall** is disabled until you type;
after typing + grading you see the coach's take and a highlighted suggested rating; choosing a
rating advances the card. Confirm a `review_log` row was written:
`sqlite3 .data/abrany.db "SELECT recall_text, rating, verdict FROM review_log ORDER BY id DESC LIMIT 1;"`

- [ ] **Step 6: Commit**

```bash
git add app/api/reviews/[id]/route.ts app/app/review/page.tsx components/app/ReviewQuiz.tsx
git commit -m "feat(reviews): recall-first card, grade-my-recall, persist recall attempts"
```

---

### Task 6: Review section organization (stats, coming up, your rotation)

Add summary counts, an upcoming preview, and a prunable rotation list — in the repo, the
`/api/reviews` payload, and the page.

**Files:**
- Modify: `lib/repo.ts:1359-1366` (`SrsUpcoming` type + `srsSummary`) and add `upcomingReviews`, `enrolledLessons`
- Modify: `app/api/reviews/route.ts` (return `upcoming` + `rotation`)
- Modify: `app/app/review/page.tsx` (render stats, "Coming up", "Your rotation" with remove)
- Test: `tests/summary.test.ts`

**Interfaces:**
- Consumes: `seedReadyLesson` (Task 1); `enrollLesson`, `autoEnrollLesson`, `saveReview`, `DUE_JOIN`.
- Produces:
  - `type SrsUpcoming = { enrolled: number; dueToday: number; learning: number; mastered: number }`
  - `type UpcomingReview = { id: number; title: string; goal_title: string; srs_due: string }`
  - `type EnrolledLesson = { id: number; title: string; goal_id: number; goal_title: string; milestone_title: string; srs_due: string; srs_reps: number; srs_interval: number }`
  - `upcomingReviews(userId: number, limit?: number): UpcomingReview[]` — enrolled, due after today, `status='ready'`, soonest first.
  - `enrolledLessons(userId: number): EnrolledLesson[]` — all enrolled, ordered by goal then due.
  - `GET /api/reviews` returns `{ due, summary, upcoming, rotation }`.

- [ ] **Step 1: Write failing tests**

Create `tests/summary.test.ts`:

```ts
import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import {
  enrollLesson,
  autoEnrollLesson,
  srsSummary,
  upcomingReviews,
  enrolledLessons,
} from "../lib/repo.ts";

test("srsSummary counts enrolled / dueToday / learning", () => {
  const a = seedReadyLesson();
  const b = seedReadyLesson({}); // same-user isolation not required; separate users are fine
  enrollLesson(a.lesson.id); // due today, reps 0 -> learning
  autoEnrollLesson(b.lesson.id); // due tomorrow
  // NOTE: seedReadyLesson makes a new user each call; assert per-user.
  const s = srsSummary(a.userId);
  assert.equal(s.enrolled, 1);
  assert.equal(s.dueToday, 1);
  assert.equal(s.learning, 1);
});

test("upcomingReviews lists future-due lessons only", () => {
  const { lesson, userId } = seedReadyLesson();
  autoEnrollLesson(lesson.id); // tomorrow
  const up = upcomingReviews(userId);
  assert.equal(up.length, 1);
  assert.equal(up[0].id, lesson.id);
});

test("enrolledLessons returns the rotation for a user", () => {
  const { lesson, userId } = seedReadyLesson();
  enrollLesson(lesson.id);
  const rot = enrolledLessons(userId);
  assert.equal(rot.length, 1);
  assert.equal(rot[0].id, lesson.id);
  assert.equal(typeof rot[0].goal_title, "string");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `upcomingReviews` / `enrolledLessons` / `summary.learning` undefined.

- [ ] **Step 3: Extend the summary + add the two queries**

In `lib/repo.ts`, replace the `SrsUpcoming` type and `srsSummary` (lines `1359-1366`) with:

```ts
export type SrsUpcoming = { enrolled: number; dueToday: number; learning: number; mastered: number };

export function srsSummary(userId: number): SrsUpcoming {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS enrolled,
         SUM(CASE WHEN l.srs_reps < 2 THEN 1 ELSE 0 END) AS learning,
         SUM(CASE WHEN l.srs_interval >= 21 THEN 1 ELSE 0 END) AS mastered
       ${DUE_JOIN}
       WHERE g.user_id = ? AND l.srs_due IS NOT NULL`,
    )
    .get(userId) as { enrolled: number; learning: number | null; mastered: number | null };
  return {
    enrolled: row.enrolled,
    dueToday: dueCount(userId),
    learning: row.learning ?? 0,
    mastered: row.mastered ?? 0,
  };
}

export type UpcomingReview = { id: number; title: string; goal_title: string; srs_due: string };

/** Next few lessons due after today (for the "coming up" preview). */
export function upcomingReviews(userId: number, limit = 5): UpcomingReview[] {
  return getDb()
    .prepare(
      `SELECT l.id, l.title, g.title AS goal_title, l.srs_due
       ${DUE_JOIN}
       WHERE g.user_id = ? AND l.srs_due IS NOT NULL AND date(l.srs_due) > date('now') AND l.status = 'ready'
       ORDER BY l.srs_due, l.id LIMIT ?`,
    )
    .all(userId, limit) as UpcomingReview[];
}

export type EnrolledLesson = {
  id: number;
  title: string;
  goal_id: number;
  goal_title: string;
  milestone_title: string;
  srs_due: string;
  srs_reps: number;
  srs_interval: number;
};

/** Every lesson in the user's review rotation, grouped-friendly (goal, then due date). */
export function enrolledLessons(userId: number): EnrolledLesson[] {
  return getDb()
    .prepare(
      `SELECT l.id, l.title, g.id AS goal_id, g.title AS goal_title, pi.title AS milestone_title,
              l.srs_due, l.srs_reps, l.srs_interval
       ${DUE_JOIN}
       WHERE g.user_id = ? AND l.srs_due IS NOT NULL
       ORDER BY g.title, l.srs_due, l.id`,
    )
    .all(userId) as EnrolledLesson[];
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Extend the reviews GET payload**

In `app/api/reviews/route.ts`, replace the handler:

```ts
import { NextResponse } from "next/server";
import { dueLessons, srsSummary, upcomingReviews, enrolledLessons } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    due: dueLessons(user.id),
    summary: srsSummary(user.id),
    upcoming: upcomingReviews(user.id),
    rotation: enrolledLessons(user.id),
  });
}
```

(The sidebar badge reads `summary.dueToday`, which is unchanged — no sidebar edit needed.)

- [ ] **Step 6: Render stats, Coming up, and Your rotation**

In `app/app/review/page.tsx`, extend the response type and state (lines `12`, `22-23`):

```tsx
import { dueLabel, ... } from "@/lib/srs";
import type { DueLesson, SrsUpcoming, UpcomingReview, EnrolledLesson } from "@/lib/repo";

type Resp = { due: DueLesson[]; summary: SrsUpcoming; upcoming: UpcomingReview[]; rotation: EnrolledLesson[] };
```

Add state and load them (in `load`, lines `36-42`):

```tsx
  const [upcoming, setUpcoming] = useState<UpcomingReview[]>([]);
  const [rotation, setRotation] = useState<EnrolledLesson[]>([]);
```
```tsx
  const load = useCallback(async () => {
    const d = await api<Resp>("/api/reviews");
    setQueue(d.due);
    setSummary(d.summary);
    setUpcoming(d.upcoming);
    setRotation(d.rotation);
    setI(0);
    resetCard();
  }, []);
```

Update the header stats line (replace lines `77-83`):

```tsx
        {summary && (
          <p className="mt-2 text-[14px] text-muted">
            {summary.dueToday > 0
              ? `${summary.dueToday} due today · ${summary.learning} still learning · ${summary.mastered} mastered · ${summary.enrolled} in rotation.`
              : `${summary.enrolled} in rotation · ${summary.learning} still learning · ${summary.mastered} mastered. Nothing due right now.`}
          </p>
        )}
```

Add a remove handler (near `grade`, after line `63`):

```tsx
  const removeFromRotation = async (lessonId: number) => {
    await api(`/api/lessons/${lessonId}/enroll`, { method: "DELETE" }).catch(() => {});
    load().catch(() => {});
  };
```

At the end of the returned JSX, before the closing `</div>` (after line `194`), add the two
sections (they show whenever the queue is empty OR always below the card — render them always):

```tsx
      {upcoming.length > 0 && (
        <section className="glass rounded-[var(--radius-card-lg)] p-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-accent">Coming up</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {upcoming.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="truncate text-ink">{u.title}</span>
                <span className="shrink-0 text-muted">{dueLabel(daysUntil(u.srs_due))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rotation.length > 0 && (
        <details className="glass rounded-[var(--radius-card-lg)] p-6">
          <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wider text-accent">
            Your rotation · {rotation.length}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {rotation.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0">
                  <span className="truncate text-ink">{r.title}</span>
                  <span className="ml-2 text-[11px] text-muted">{r.goal_title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted">{dueLabel(daysUntil(r.srs_due))}</span>
                  <button
                    onClick={() => removeFromRotation(r.id)}
                    className="text-[11.5px] font-semibold text-muted hover:text-accent"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
```

Add the `daysUntil` helper at the bottom of the file (module scope, after the component):

```tsx
/** Whole days from today to an ISO date string (yyyy-mm-dd), clamped at 0. */
function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso + "T00:00:00");
  return Math.max(0, Math.round((due.getTime() - today.getTime()) / 86_400_000));
}
```

- [ ] **Step 7: Typecheck and verify in the app**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run dev`, open `/app/review`.
Expected: header shows the due/learning/mastered/rotation counts; "Coming up" lists future-due
lessons with relative dates; "Your rotation" is a collapsible list with working **Remove** buttons
that drop a lesson from reviews (and set its opt-out).

- [ ] **Step 8: Commit**

```bash
git add lib/repo.ts app/api/reviews/route.ts app/app/review/page.tsx tests/summary.test.ts
git commit -m "feat(reviews): rotation stats, coming-up preview, prunable rotation list"
```

---

## Self-Review

**Spec coverage:**
- Auto-enroll on completion (opt-out, +1 day) → Tasks 2, 3. ✓
- Toast confirmation → Task 3. ✓
- Recall-first card + own-words test → Task 5. ✓
- AI grade reuse (`gradeReviewQuiz`, single item) → Task 5. ✓
- Persisted recall (`review_log`) → Tasks 4, 5. ✓
- Section organization (stats, coming up, rotation, remove) → Task 6. ✓
- Sidebar badge stays honest (reads unchanged `summary.dueToday`) → Task 6 note. ✓
- No retroactive enrollment → nothing enrolls historical rows (autoEnroll only fires on a new completion). ✓
- Test harness (none existed) → Task 1. ✓

**Placeholder scan:** none — every code step shows full code; manual-verification steps give exact commands and expected observations.

**Type consistency:** `autoEnrollLesson → { enrolled }` (Tasks 2/3); `SrsUpcoming` extended fields used identically in repo, route, and page (Task 6); `ReviewQuiz` new props (`objective`, `recall`, `onVerdict`) match call site (Task 5); `logReview` arg shape identical in Tasks 4 and 5; `daysUntil` defined and used in Task 6.

**Note on route tests:** server route handlers depend on `getSessionUser()` (cookies), so they are covered by unit-testing the repo functions they delegate to (Tasks 2, 4, 6) plus explicit manual verification steps (Tasks 3, 5, 6) rather than an HTTP harness — a deliberate scope choice given no server-test infra exists.
