---
id: 0013
title: Swappable / load-balanced LLM provider (MiniMax + Kimi)
status: proposed
owner: claude
date: 2026-07-12
---

## Context
Both MiniMax and Kimi Code expose Anthropic-compatible endpoints and are coding-plan
subscriptions with shared concurrency limits. Running everything on one plan strains its limit;
David has both and wants to spread the load (raised at project start re: MiniMax's shared cap).

## Decision
The LLM layer (`lib/minimax.ts`) is provider-aware, selected by `LLM_PROVIDER`:
- `minimax` (default) — MiniMax M3, `https://api.minimax.io/anthropic`
- `kimi` — Kimi Code "K2.7 Code" (model `k2.7-code`), `https://api.kimi.com/coding` (NOT
  `api.moonshot.*` — the `sk-kimi-` key only authenticates on the coding endpoint)
- `balanced` — round-robin per call across both, halving each plan's load
One Anthropic SDK client drives either (both accept the SDK's `apiKey`/x-api-key). Kimi K2.7
returns `thinking` + `text` blocks; the text filter already isolates the answer. All calls still
pass through the shared concurrency queue.

## Consequences
Load can be spread across two subscriptions (eases the shared-limit concern), and either model
can be A/B'd by flipping one env var — no code change. Kimi also exposes native
`/coding/v1/search` + `/fetch` endpoints, a future option for research without Brave.

## Review
Proposed — ratify multi-provider with MiniMax as the default and `balanced` available. Supersedes
the single-provider assumption in [[0002-minimax-anthropic-endpoint]].
