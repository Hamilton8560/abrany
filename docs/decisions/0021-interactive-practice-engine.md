---
id: 0021
title: Interactive practice engine — progressive problems, hint ladder, AI check, debrief
status: proposed
owner: claude
date: 2026-09-04
---

## Context
Every "practice" / "apply" / "check" stage of the kata is a static markdown page: exercises
with the answers at the bottom. For code, math and drills that is where learning actually
happens, and static pages fail it three ways: nothing stops the learner reading the answer
first, nothing tells them *why* their attempt was wrong, and nothing adapts when they're stuck.
David's ask: "doing problems, debriefing, hinting assistance … in a progressive route."

## Decision
A per-lesson **practice set** the learner works one problem at a time inside the app:

- **Generation** (`generatePracticeSet`): 4–8 problems grounded in the lesson content, ordered
  warm-up → core → stretch, each with a `kind` matched to the subject (`code` with starter +
  expected output, `numeric` with units, `short` drills, `explain` with a rubric), a **3-rung
  hint ladder that never contains the answer** (nudge → strategy → next concrete step), a full
  worked solution and a grading rubric. Solutions and hints stay server-side; the client only
  sees prompts until it asks.
- **Checking** (`gradePracticeAttempt`): the coach grades the *idea* (equivalent methods count),
  then coaches — what's right, what's wrong and why, one unblocking correction, never the full
  answer on a miss. Every attempt is persisted (`practice_attempts`) with hints used.
- **Adaptation**: "Give me an easier one" inserts a stepping-stone variant isolating the
  sub-skill the learner is stuck on; "Push me" inserts a harder follow-up. Reveal is allowed
  once hints are exhausted or after two attempts.
- **Debrief** (`debriefPracticeSet`): patterns across the set, the one misconception to fix,
  one next action. Finishing marks the section complete, stores a letter grade on the lesson
  (transcript) and auto-enrolls it in spaced review.
- Companion: the tutor chat is now **lesson-grounded** ("Ask the tutor" from any lesson) and
  follows the same hint-ladder rules (`TUTOR_SYSTEM`, `lessonGroundingPrompt`).

Tables `practice_sets` / `practice_attempts`; routes `POST/GET /api/lessons/[id]/practice`
and `POST /api/practice/[id]` (hint · check · reveal · variant · finish); UI
`components/app/PracticeSession.tsx`, launched from the lesson row and viewer for
practice/apply/check sections.

## Consequences
- Practice becomes active and adaptive across every subject; the static practice markdown
  stays as reference (its prompt now also demands warm-up/core/stretch rungs, a hints section
  and worked answers).
- Costs one AI call per set, one per check, one per variant, one per debrief — all on the
  learner's resolved AI (own key, company AI, or server). Hints and reveals are free.
- The lesson grade now has a real basis (problem outcomes) instead of a self-report.

## Review
Proposed. Open for David: should a passed practice set be *required* before a section can be
marked complete for company assignments (stricter pass/fail), or stay optional as built?
