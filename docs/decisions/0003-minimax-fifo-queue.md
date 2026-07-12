---
id: 0003
title: Global FIFO concurrency queue for MiniMax (cap 2)
status: approved
owner: david
date: 2026-07-12
---

## Context
MiniMax enforces a concurrency limit that is shared across David's other apps, so this app
must be a good citizen.

## Decision
A process-global FIFO limiter caps concurrent MiniMax calls at 2 (env
`MINIMAX_MAX_CONCURRENCY`), with jittered exponential backoff on 429/5xx. A live badge shows
active/queued.

## Consequences
Cooperates with other MiniMax apps; predictable. Halves throughput vs. a higher cap —
acceptable trade for not getting throttled.

## Review
David chose "global cap of 2, FIFO."
