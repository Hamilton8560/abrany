---
id: 0015
title: Org programs — reusable templates with localized delivery
status: proposed
owner: claude
date: 2026-07-19
---

## Context
An org owner wants to author a training program once, deploy it to many employees at once, have
each employee receive it in their own language, and monitor engagement in the owner's language.
Today assignments are one-off per employee, authored in the employee's language — so an
English-speaking owner sees Spanish content he can't review.

## Decision
Introduce a **Program**: a reusable, org-owned lesson-plan template (`programs` /
`program_milestones` / `program_lessons`) authored in one canonical `source_lang`. Deploying a
program instantiates it as normal per-employee assignments via the existing `createAssignment`
(each employee gets their own copy/goal), stamping `assignments.program_id` for cohort grouping.
Localization reuses the existing background-queued, cached translation engine (`translate.ts`):
deploy pre-enqueues a per-lesson translation for each employee whose language differs from
`source_lang`. The owner authors, reviews, and monitors against the source-language program.

Authoring is available both in-app (AI draft → edit → save) and via the partner API/MCP, writing
the same library.

## Consequences
- Reuses assignments, the translation cache/queue, per-user language, and white-label certs —
  little new machinery beyond the program tables and a deploy loop.
- `assignments.program_id` is `ON DELETE SET NULL`: deleting a program never touches an employee's
  in-progress goal.
- Deploy instantiates copies, so employees keep studying at their own pace ("control their own
  education freely"), consistent with today's model. Editing a program does not retroactively
  update already-assigned employees (v1); versioning is deferred.
- Out of scope v1: translating employees' free-text quiz/exam answers back to the owner's language.

## Review
Design spec: `docs/superpowers/specs/2026-07-19-org-programs-multilingual-design.md`.
Open question for David: employee reads in their own settings language (assumed) vs. an owner-chosen
per-deploy target language.
