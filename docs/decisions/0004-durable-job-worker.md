---
id: 0004
title: Durable job queue + background worker for content generation
status: approved
owner: david
date: 2026-07-12
---

## Context
Lesson content generation is large and slow; it must not block the UI or force everything
through one context.

## Decision
A durable `jobs` table + a self-scheduling background worker drain generation through the
shared MiniMax queue. Trigger is on-demand + a "Prepare" action. Orphaned jobs recover on
restart.

## Consequences
Async, continuous, restart-safe. Constraint learned the hard way: the worker must NOT wrap
generation in the concurrency queue again — `complete()` already does, and nesting deadlocks
the cap.

## Review
David chose "on-demand + Prepare" async generation.
