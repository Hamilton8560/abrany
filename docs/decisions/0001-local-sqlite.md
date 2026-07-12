---
id: 0001
title: Local SQLite via node:sqlite for persistence
status: approved
owner: david
date: 2026-07-12
---

## Context
A single-user personal training app needs durable, queryable local storage for goals,
plans, sessions, lessons, and chat — without standing up hosted infrastructure.

## Decision
Use Node's built-in `node:sqlite` (Node 22.5+) at `.data/abrany.db` (gitignored), fronted
by a typed repo layer. No native dependency, no server.

## Consequences
Zero deploy infra; survives restarts; easy to back up. Not multi-device — acceptable for a
personal app now; revisit if cloud sync is needed.

## Review
David chose local SQLite over browser localStorage and hosted Postgres.
