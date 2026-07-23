---
id: 0019
title: Auto-enroll completed lessons into spaced review, recall-first
status: proposed
owner: claude
date: 2026-07-23
---

## Context
ADR-0010 established spaced repetition, but enrollment is opt-in: a lesson only joins the review
rotation when the learner finds and taps "Add to reviews" in the lesson viewer. In practice people
finish lessons and end up with **zero reviews** — they never discover the button — so the
make-it-stick loop never starts. Separately, the review card leads with a passive recall cue and
jumps to self-rating, which does not require the learner to actually produce the knowledge.

## Decision
Two changes to the review pipeline:

1. **Auto-enroll on completion (opt-out).** Marking a lesson complete enrolls it into review
   automatically, when the lesson is `ready` and the user has not previously removed it (new
   `srs_optout` flag). The first review is scheduled for **tomorrow** (not the same day), matching
   SM-2's first interval — testing recall seconds after reading is ineffective. Manual "Add to
   reviews" keeps its deliberate "due today" behavior. A dismissable toast confirms enrollment so
   the pipeline stays visible.
2. **Recall-first reviews.** Each review opens with a blank "explain it from memory, in your own
   words" box before the answer is revealed (retrieval practice + self-explanation). The learner
   can reveal and self-rate for free, or have the coach grade their written recall (reusing the
   existing `gradeReviewQuiz`, no new AI code) for a suggested rating. Recall attempts are persisted
   to a `review_log` so learners accumulate a record of their own explanations.

The `/app/review` section also gains upcoming/rotation views so reviews are legible and prunable;
the sidebar due-count badge is unchanged (auto-enroll schedules for tomorrow, so it does not spike).

## Consequences
Nobody has zero reviews by accident, and every review forces active recall in the learner's own
words — the strongest evidence-based combination. Costs: a schema change (`srs_optout` column, a
`review_log` table) and a migration of the enrollment model from opt-in (ADR-0010) to opt-out.
Existing pre-feature completions are **not** retroactively enrolled (avoids dumping a backlog);
a one-time "add my past lessons" import is a deferred follow-up. Free-tier reviews remain
zero-LLM-cost; AI grading stays on-demand.

## Review
Proposed — ratify (a) automatic opt-out enrollment on lesson completion with a +1-day first
interval, and (b) recall-first review cards with persisted recall history, superseding the manual
opt-in enrollment described in ADR-0010.
