---
id: 0017
title: V2 outcome-based plans, course marketplace, community forums
status: proposed
owner: claude
date: 2026-07-15
---

## Context

David asked for a strategy review of the "pretty generalized" learning plans, a V2
that must not disturb legacy plans, management/editing for created courses, a public
marketplace, and a community with forums per age group and learning interest. Full
analysis: `docs/reports/2026-07-15-learning-plans-v2-strategy.md`.

## Decision

- **V2 plans are a version, not a migration.** `plans.version` (existing rows = 1) +
  additive `plan_items` columns (`outcomes` JSON, `hours`, `difficulty`). New
  generations use `generatePlanV2`: an intake (level, hours/week, optional target
  date and focus) feeds an outcome-first prompt — measurable "you can …" outcomes
  per milestone, numeric hours summing to an honest total, difficulty ramp, mandatory
  capstone, and a summary that must admit when a target date doesn't fit. V1 plans
  render exactly as before; the V1 generator stays in the codebase untouched.
- **Courses are editable.** Structural editing (rename/re-detail/reorder/add/delete
  milestones; rename/delete/add sections) via extended plan-item and lesson routes,
  surfaced as an "Edit course" mode on the goal page. Content generation is untouched
  by edits.
- **Marketplace = listing + deep clone.** `course_listings` points at the author's
  live goal (title snapshot, blurb, tags, age group, clone count). Cloning deep-copies
  the latest plan, milestones and sections *with generated content*, resets all
  progress, and re-creates exams so the cloner earns their own certificate. In-app
  only (signed-in users) for now.
- **Community = seeded forums, two axes.** 4 age-group + 8 interest forums seeded
  idempotently in the migration by stable slug; threads + replies with display names;
  delete restricted to the author or the app owner.

## Consequences

- Zero new dependencies; legacy plans provably unaffected (smoke-tested an existing
  v1 plan through editing after the migration).
- Cloned courses inherit content quality from the author's AI; exams still gate
  certificates per-learner, so credentials stay honest.
- Marketplace listings expose author display names — acceptable in-app; revisit
  before any public (unauthenticated) marketplace page.
- Deferred: adaptive re-planning from assessment results, plan-generation critique
  pass, listing ratings/reviews, forum moderation & notifications, per-forum
  subscriptions.

## Review

- Verified on a scratch DB: milestone rename/add/reorder + section delete; publish →
  browse with age/tag filters → clone (content ready, progress reset, fresh exams);
  12 forums seeded; thread + cross-user reply; V2 plan route validates intake and
  correctly demands an AI key. `tsc --noEmit` and `next build` clean.
