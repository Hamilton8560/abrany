---
id: 0002
title: Drive MiniMax M3 via the Anthropic-compatible endpoint
status: proposed
owner: claude
date: 2026-07-12
---

## Context
The coach, plans, and lesson content need an LLM. David has a MiniMax coding-plan
subscription (`sk-cp`) that exposes an Anthropic-compatible endpoint (near-free within its
5-hour windows).

## Decision
Call `MiniMax-M3` through `@anthropic-ai/sdk` with `baseURL=https://api.minimax.io/anthropic`
(NOT `/v1` — the SDK appends that; including it 404s).

## Consequences
Reuses the existing subscription; standard SDK. Text-only — audio/image/video are separate
pay-per-use meters, not covered by this key.

## Review
Proposed — ratify MiniMax M3 as the model/vendor for the app.
