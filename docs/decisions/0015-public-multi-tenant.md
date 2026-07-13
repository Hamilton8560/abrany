---
id: 0015
title: Go public — multi-tenant auth, BYO AI keys, owner uses built-in keys
status: proposed
owner: claude
date: 2026-07-12
---

## Context
David wants to deploy Abrany publicly and let anyone use it free. The AI currently runs on his
personal MiniMax/Kimi coding-plan keys, which have tight shared limits and can't serve the public.

## Decision
Turn Abrany into a multi-tenant app:
1. **Auth** — email/password signup + login; scrypt hashing; HMAC-signed session cookie (no deps).
   The **owner** account (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, davidhamilton473@gmail.com) is seeded from
   env and uses the server's built-in AI keys.
2. **Per-user data isolation** — every user's goals/lessons/books/etc. are private to them.
3. **Bring-your-own AI key** — each non-owner user stores their own provider + key; supported
   providers: MiniMax, Kimi, **DeepSeek**, **OpenRouter** (the latter two are OpenAI-compatible).
   So the public pays for their own AI; the host only pays for hosting.
4. **Deploy** — persistent host + durable storage (the in-process worker + SQLite need a
   long-lived server, not serverless).

## Consequences
"Free for users" becomes viable (they bring keys). Isolation is security-critical — no query may
leak across users; must be verified before any public deploy. The LLM layer must handle both
Anthropic-style (MiniMax/Kimi) and OpenAI-style (DeepSeek/OpenRouter) endpoints and pick per-user
creds (owner → env). Built in phases; **do not deploy until Phase 2 isolation is proven.**

## Review
Proposed — ratify the public/BYO-key model with an env-seeded owner on built-in keys.
