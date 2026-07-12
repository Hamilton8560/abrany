---
id: 0010
title: Spaced-repetition assessments + in-app follow-ups
status: proposed
owner: claude
date: 2026-07-12
---

## Context
The original vision asks for "assessments and periodic follow-ups like any coach." Things take
time and repetition to stick, so the coach should resurface material on a schedule and lean
harder on what's weak.

## Decision
Spaced repetition (SM-2 lite) over lessons. A lesson is enrolled via "Add to reviews"; a
`/app/review` queue surfaces what's due, showing the lesson's objective as a recall cue with a
reveal, then a self-rating (Again / Hard / Good / Easy) that reschedules it. Follow-ups surface
**in-app** (a Review queue + a sidebar due-count badge) — no email/push, since this is a local
single-user app. The core loop reuses existing lesson content, so it costs **no LLM calls**.

## Consequences
Proven scheduling that expands intervals for known material and shortens them for weak material;
zero per-review cost. It does not yet generate fresh quiz questions each review (an optional
"Quiz me" generation is deferred), and follow-ups don't leave the app (no notifications).

## Review
Proposed — ratify SM-2 self-rating + in-app queue as the follow-up mechanism (vs. push/email
reminders, or an LLM-generated quiz per review).
