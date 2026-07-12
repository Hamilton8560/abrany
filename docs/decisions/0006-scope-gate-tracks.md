---
id: 0006
title: Scope gate — decompose oversized goals into tracks
status: approved
owner: david
date: 2026-07-12
---

## Context
Goals like "learn all math 1-12" or "all of math" cannot be one plan without overwhelming
the learner (and the context).

## Decision
On goal creation the coach classifies feasibility. Oversized goals are refused as one plan
and decomposed into selectable sub-goal "tracks" (`goals.parent_goal_id`); the umbrella goal
renders its tracks instead of a plan.

## Consequences
Everything stays digestible and recurses uniformly. Adds an "assess" step before creation.

## Review
David chose "propose tracks, you pick."
