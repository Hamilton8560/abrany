---
id: 0007
title: Web-grounding time-sensitive lessons via Brave Search
status: proposed
owner: claude
date: 2026-07-12
---

## Context
Time-sensitive subjects (geopolitics, current tech, news) are wrong when generated from the
model's training memory alone.

## Decision
The coach flags `needsCurrent` lessons; the worker fetches live results from the Brave Search
API and passes them into generation, which cites `[n]` inline and appends a `## Sources`
list. Sources are stored on the lesson.

## Consequences
Correct, current content with citations; no Higgsfield credits (Brave key reused from
`~/trading-floor/.env`). Adds one search call per flagged lesson.

## Review
Proposed — ratify Brave as the search provider (vs. Tavily/Serper/etc.).
