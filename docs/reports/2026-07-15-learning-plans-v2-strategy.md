# Learning Plans V2 — strategy report

*2026-07-15 · prepared for David · pairs with ADR 0017*

## 1. Where we are

The content pipeline is strong and layered: goal → scope gate (oversized goals decompose
into tracks) → **plan** (5–9 milestones, one LLM call) → each milestone expands into the
six-stage kata (read → teach → practice → apply → check → review, mode-adaptive) → real
markdown lessons, web-grounded when time-sensitive → SM-2 spaced reviews → midterm/final
exams that gate a verifiable, white-labelable certificate. B2B assignments ride the same
spine.

The weak layer is the **plan itself**. Everything below it (kata, lessons, exams) is
calibrated; the plan on top is the most generic step in the chain.

## 2. Why plans feel generalized — diagnosis

1. **No learner model.** `generatePlan()` receives only the goal title + description.
   The coach persona says "meet the user where they are," but the plan prompt never
   learns current level, hours per week, deadline, or why they're learning. Identical
   goal text → near-identical plan for a beginner with 2 h/week and an expert with 20.
2. **Topic-shaped, not outcome-shaped.** Milestones are titles ("Learn the basics of X")
   with a fuzzy `estimate` ("1–2 weeks"). There are no measurable outcomes — nothing
   that says *"after this you can hold a 5-minute conversation about family."* Backward
   design (define the demonstrable outcome, then derive content) is the single
   highest-leverage fix.
3. **Estimates float free of any time budget.** "1–2 weeks" of *what*? Without an
   hours/week assumption there's no total-hours math, no honest "this is a 60-hour
   course," and no way to fit a plan to an org-assigned deadline (which we now have).
4. **No difficulty ramp metadata.** Items are ordered foundation→advanced by prompt
   convention, but nothing marks intro/core/advanced or prerequisites, so the UI can't
   communicate the ramp and cloning/editing can't respect it.
5. **Static after generation.** Quiz grades, exam scores and SRS ratings are collected
   but never flow back into the plan. A learner failing every `check` stage sees the
   same remaining plan as one acing it. (V2 lays the data groundwork: per-item outcomes +
   checkpoint flags make "re-plan from here" possible later.)
6. **No capstone.** Plans end at the last milestone; there's no integrating project that
   forces transfer — the thing that actually proves the goal is met.
7. **Single-shot JSON at temp 0.6.** One generation, no self-critique pass, hard 5–9
   item band regardless of scope. Cheap to improve marginally, but the intake fix
   (finding 1) dominates; a critique pass can come later.

## 3. V2 plans — design

One new generation path, versioned so **legacy plans are untouched**:

- **Intake before generation** (small optional form): current level (new / some / solid),
  hours per week, optional target date, optional "why / focus." Every field flows into
  the prompt. Skipping the form still produces a V2 plan with stated default assumptions.
- **Outcome-first milestones.** Each item carries `outcomes[]` — 2–4 measurable "you can
  …" statements — plus `hours` (numeric, derived from the budget), `difficulty`
  (intro/core/advanced). The prompt is instructed to design outcomes first, then title
  the milestone after them.
- **Honest time math.** The plan states its hours/week assumption and total hours, and
  when a target date is given it must either fit or *say it doesn't fit* and propose the
  trimmed scope that does.
- **Capstone required.** The final item is an integrating project whose outcomes restate
  the goal in demonstrable form.
- **Same downstream machinery.** V2 items expand through the existing kata unchanged —
  lessons, exams, SRS, certificates, org assignments all just work.

**Legacy safety:** `plans.version` (existing rows = 1) and additive `plan_items` columns
(`outcomes`, `hours`, `difficulty` — empty/0 on v1 rows). V1 plans render exactly as
today; the UI shows outcomes/hours/ramp only when present. Nothing rewrites old rows.

## 4. Courses become assets: manage → edit → publish

A plan you generated is now a **course you own**, so it gets a lifecycle:

- **Edit:** rename/re-detail milestones, reorder, delete, add; rename/delete/add
  sections. (Generated content stays; edits are structural + textual.)
- **Publish to the marketplace:** a listing (title, blurb, tags, audience age group)
  points at your course. Publishing is opt-in per course and reversible.
- **Clone:** anyone can add a published course to their goals — a deep copy of plan,
  milestones and sections *with generated content included* (completion, reading time,
  SRS and grades reset; they take their own exams). Clone counts show social proof.
  Cloned copies are theirs to edit; the listing keeps pointing at the author's course.

This is the supply side of a flywheel: B2B orgs author curricula (API/MCP), individuals
polish personal courses, the marketplace redistributes them, certificates advertise them.

## 5. Community

Learning sticks when it's social. Forums are seeded along the two axes people actually
self-select by:

- **Age groups:** Kids & Parents · Teens · Adults · 50+
- **Interests:** Languages · STEM & Coding · Trades & Safety · Business & Money ·
  Arts & Music · Faith & Philosophy · Test Prep & Certs · Health & Fitness

Threads + replies, display names from the existing profile, marketplace listings can be
linked in posts. No moderation tooling in the MVP beyond author/owner delete; add
reporting when there are strangers in the room.

## 6. Sequencing

1. V2 plan engine (schema + prompt + intake UI) — the report's core fix
2. Course editing (structural APIs + edit mode on the goal page)
3. Marketplace (listings, browse/filter, clone)
4. Community (forums, threads, replies)

Later (explicitly deferred): adaptive re-planning from assessment signals, a critique
pass on plan generation, marketplace ratings/reviews, forum moderation & notifications.
