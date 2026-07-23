# Design: Self-running reviews — auto-enroll + recall-first

**Date:** 2026-07-23
**Owner:** claude (for David's review)
**Status:** draft — awaiting approval
**Relates to:** ADR-0010 (Spaced-repetition assessments + in-app follow-ups). Extends it by
changing enrollment from *manual* to *automatic*. See "Decision to record" below.

## Problem

Reviews are spaced-repetition practice for lessons (SM-2 lite). Today a lesson only enters the
review rotation when a user opens it and taps a small **"Add to reviews"** toggle buried in the
lesson viewer (`components/app/MilestoneLessons.tsx:382`). There is no automatic trigger — no cron,
no post-completion hook. Result: teammates finish lessons and have **zero reviews**, because they
never found the button. The feature's core value (making learning stick) never activates.

Additionally, the current review card leads with a passive "try to recall" prompt and jumps
straight to self-rating. It does not require the learner to actually *produce* the knowledge, which
is where the learning happens.

## Goals

1. Nobody has zero reviews by accident — finishing a lesson enrolls it, automatically.
2. Every review makes the learner prove recall **in their own words** before revealing the answer.
3. The review section is a legible, manageable space — you can see what's due, what's coming, and
   what's in your rotation, and prune it.
4. The whole pipeline (enroll → due → review → reschedule) is visible, including in the sidebar.

## Non-goals

- Retroactively enrolling lessons completed before this ships (would dump a large backlog on
  existing users). A one-time opt-in "add my past lessons" is a possible later follow-up.
- Changing the SM-2 scheduling math itself (`lib/srs.ts`) beyond the first-interval choice below.
- Peer/code review. "Reviews" here means spaced self-review only.

## Current architecture (as-is)

- **State:** SRS columns live on `lessons` (`lib/db.ts:354`): `srs_due` (NULL = not enrolled),
  `srs_interval`, `srs_ease`, `srs_reps`, `srs_last`.
- **Enroll:** `enrollLesson(id)` (`lib/repo.ts:1318`) sets `srs_due = date('now')` when `srs_due IS
  NULL`. Called only by `POST /api/lessons/[id]/enroll`, only from the viewer toggle.
- **Completion:** "Mark section complete" → `setDone` → `PATCH /api/lessons/[id] {done:true}` →
  `setLessonCompleted` (`app/api/lessons/[id]/route.ts:31`).
- **Due list:** `dueLessons(userId)` / `dueCount(userId)` (`lib/repo.ts:1338`) — enrolled AND
  `srs_due <= today` AND `status='ready'`, scoped by `goals.user_id`.
- **Review UI:** `/app/review` (`app/app/review/page.tsx`) — one card at a time: recall prompt →
  Show lesson / Quiz me → self-rate Again/Hard/Good/Easy → `POST /api/reviews/[id]` →
  `saveReview` (SM-2).
- **AI grading:** `POST /api/lessons/[id]/grade` → `gradeReviewQuiz` (`lib/coach.ts`) grades
  `{question, answer}` items, returns per-item verdicts + a `suggested` rating.
- **Sidebar:** `components/app/Sidebar.tsx` — "Review" nav item with a due-count badge polling
  `/api/reviews` every 15s (`useDueCount`).

## Design

### 1. Auto-enroll on completion

Enroll a lesson into reviews automatically when it is first marked complete.

- **Trigger:** in `PATCH /api/lessons/[id]`, when `body.done === true`, after `setLessonCompleted`,
  call a new `autoEnrollLesson(id)` that enrolls only if:
  - lesson `status === 'ready'` (has content to review), AND
  - `srs_due IS NULL` (not already enrolled), AND
  - `srs_optout = 0` (user has not deliberately removed it before).
- **First interval:** auto-enroll schedules the first review for **tomorrow** (`date('now','+1
  day')`, `srs_interval = 1`, `srs_ease = 2.3`, `srs_reps = 0`), not today. Testing recall
  immediately after reading is ineffective; +1 day is the correct first spaced interval and matches
  SM-2's first "good" step. Manual enroll (the viewer toggle) keeps its current "due today"
  behavior for deliberate re-adds.
- **Opt-out column:** add `srs_optout INTEGER DEFAULT 0` to `lessons` (`lib/db.ts` addCol). The
  viewer's "remove from reviews" (`DELETE /api/lessons/[id]/enroll`) sets `srs_optout = 1` in
  addition to clearing `srs_due`. Re-adding via the toggle clears `srs_optout = 0`.
- **Client feedback:** the PATCH response includes `{ enrolled: true }` when auto-enroll fired.
  `MilestoneLessons.setDone` shows a dismissable toast: *"✓ Added to your reviews — first check-in
  tomorrow."* Unmarking done does **not** unenroll (keeps the schedule; the learner can remove
  manually).

New/changed repo functions:
- `autoEnrollLesson(id): { enrolled: boolean }` — the gated, +1-day variant.
- `unenrollLesson(id)` also sets `srs_optout = 1`.
- `enrollLesson(id)` (manual) also clears `srs_optout = 0`.

### 2. Recall-first review card

Redesign the `/app/review` card so producing the answer comes before seeing it.

Flow per card:
1. Show goal · milestone · lesson title and the objective as the recall cue.
2. **Blank textarea:** *"From memory — explain what you learned. No peeking."*
3. Two actions:
   - **Reveal & self-rate** (free): reveals lesson content below the learner's text so they can
     compare, then enables the Again/Hard/Good/Easy buttons.
   - **Grade my recall** (AI): sends their text to grading and returns feedback + a suggested
     rating that highlights the matching button (same UX as today's Quiz-me suggestion).
4. Self-rate → `POST /api/reviews/[id] { rating, recall_text, verdict? }` → `saveReview` (SM-2) and
   append to `review_log`.

**Grading reuse:** "Grade my recall" calls `POST /api/lessons/[id]/grade` with a single item:
`{ question: <objective or "Explain what you learned about {title}">, answer: <recall text> }`.
`gradeReviewQuiz` already returns `results[].verdict/feedback`, `summary`, and `suggested` — no new
AI function required. The existing multi-question "Quiz me" remains available as a secondary button.

**Persisting recall:** new table `review_log`:
```
review_log(id, lesson_id, user_id, recall_text TEXT, rating TEXT, verdict TEXT, created_at TEXT)
```
Written on every graded review. Powers the "your own words" history and future coach context.
Repo: `logReview({lessonId, userId, recallText, rating, verdict})`,
`recentRecall(lessonId, limit)`.

### 3. Review section organization

Grow `/app/review` from a lone card into a managed space:
- **Header stats** from an extended `srsSummary`: `dueToday`, `learning` (reps < 2), `mastered`
  (interval ≥ 21d), `enrolled` total.
- **Queue:** unchanged one-card flow with "N / M" progress.
- **"Coming up":** preview of the next few upcoming due dates (new `upcomingReviews(userId,
  limit)` — enrolled, `srs_due > today`, order by due, small limit). Keeps the caught-up state
  informative instead of dead.
- **"Your rotation":** collapsible list of all enrolled lessons grouped by goal, each with due
  label (`dueLabel`) and a remove control (calls `DELETE /api/lessons/[id]/enroll`). New
  `enrolledLessons(userId)`. Makes reviews prunable and legible.

### 4. Sidebar pipeline

- The due-count badge (`useDueCount`, polling `/api/reviews`) already exists and is correct.
- Because auto-enroll schedules for tomorrow, finishing a lesson does **not** spike today's badge —
  intended. The badge reflects genuinely-due items; the toast handles instant feedback.
- Extend the `/api/reviews` `summary` payload with the new counts (§3) without breaking the
  existing `dueToday`/`enrolled` shape the badge reads.

## Data flow

```
Finish lesson ──PATCH {done:true}──▶ setLessonCompleted ──▶ autoEnrollLesson (ready, not opted out)
      │                                                              │ srs_due = tomorrow
      └──◀ {enrolled:true} → toast                                   ▼
Tomorrow ──▶ dueLessons() includes it ──▶ badge +1 ──▶ /app/review card
      recall (own words) ──▶ [Reveal | Grade my recall] ──▶ self-rate
      ──POST /api/reviews/[id]──▶ saveReview (SM-2, next srs_due) + logReview
```

## Error handling

- Auto-enroll never blocks completion: `autoEnrollLesson` failures are swallowed; the PATCH still
  returns the updated lesson (just without `enrolled:true`).
- "Grade my recall" reuses existing grade error handling (502 on LLM failure); the card falls back
  to self-rating, exactly as Quiz-me does today.
- `logReview` failures are non-fatal to scheduling (`saveReview` runs first).

## Testing (TDD)

- `autoEnrollLesson`: enrolls a ready + non-opted-out + unenrolled lesson with `srs_due` = tomorrow;
  skips when `status != 'ready'`, when `srs_optout = 1`, and when already enrolled (idempotent).
- `unenrollLesson` sets `srs_optout = 1`; manual `enrollLesson` clears it and is due today.
- `dueLessons` / `dueCount` unchanged for pre-existing rows (regression).
- `/api/lessons/[id]` PATCH returns `enrolled:true` only on the enrolling transition.
- `review_log`: `logReview` persists; `recentRecall` returns newest-first.
- `srsSummary` returns `learning` / `mastered` / `upcoming` counts correctly at interval boundaries.
- Grade-my-recall wiring: single-item payload maps to `gradeReviewQuiz` and returns a `suggested`.

## Decision to record

Auto-enrollment flips the enrollment model of ADR-0010 from opt-in to automatic-with-opt-out.
Recorded in **ADR-0019: "Auto-enroll completed lessons into spaced review, recall-first"**
(`docs/decisions/0019-auto-enroll-recall-reviews.md`, status: proposed).
