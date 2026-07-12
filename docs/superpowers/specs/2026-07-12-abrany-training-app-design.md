# Abrany — Personal Brain Trainer App (MVP Design)

**Date:** 2026-07-12
**Status:** Approved defaults (user away during brainstorm; recommended options adopted)

## 1. Vision

Turn the existing Abrany marketing site into a working **personal training / self-improvement recorder**. You train by *recording what you do*: run a Pomodoro focus session, log what you worked on, set goals and learning objectives, and chat with an AI coach (MiniMax M3) that turns big ambitions ("learn all of math", "learn Spanish") into realistic, digestible plans with periodic follow-ups and assessments.

This spec covers the **MVP** — the smallest coherent slice that is genuinely useful daily. Later phases layer on richer AI capabilities (presentations, web research, lectures/verbal, book-writing, assessments engine).

## 2. Scope

### In (MVP — Phase 1)
1. **App shell** at `/app` reusing the Abrany brand (glass system, ink/accent tokens, Archivo/Inter). Marketing landing stays at `/`; "Start Training" links into `/app`.
2. **Pomodoro timer** — configurable focus/break lengths, start/pause/reset, auto-advance focus→break, ambient state. On finishing a focus block, prompts to **record the session**.
3. **Session logging** — "what did I do" notes attached to a session (duration, optional linked goal, tags). Full history / journal view.
4. **Goals & learning objectives** — create/edit/archive goals. Each goal can hold an AI-generated **plan**.
5. **AI Coach chat** (MiniMax M3, streaming) — a realistic coach that breaks goals into digestible milestones, sets expectations about time/effort, and can generate a structured plan for a goal.
6. **MiniMax queue** — app-wide concurrency cap (default 2), FIFO, retry/backoff on 429/5xx, so this app cooperates with David's other MiniMax apps. Live queue indicator in the UI.

### Out (later phases — noted, not built now)
- Presentation generation, web research/current-info, verbal/lecture (TTS), book-writing.
- Formal assessment engine + scheduled follow-up notifications.
- Multi-user / auth / cloud sync (this is single-user, local).

## 3. Architecture

Single Next.js 16 app (App Router, React 19, Tailwind v4). Node.js runtime for API routes.

```
app/
  page.tsx                 # existing marketing landing (Start Training → /app)
  app/                     # the product
    layout.tsx             # app shell: glass sidebar + queue indicator
    page.tsx               # dashboard: quick-start timer, active goals, recent sessions
    goals/page.tsx         # goals list + create
    goals/[id]/page.tsx    # goal detail + AI plan + progress
    coach/page.tsx         # AI coach chat
    log/page.tsx           # session history / journal
  api/
    goals/route.ts         # GET list, POST create
    goals/[id]/route.ts    # GET, PATCH, DELETE
    goals/[id]/plan/route.ts   # POST → AI generates plan (queued)
    sessions/route.ts      # GET list, POST create
    plans/[id]/items/[itemId]/route.ts  # PATCH item status
    chat/route.ts          # POST → streaming coach reply (queued)
    queue/route.ts         # GET queue status
lib/
  db.ts                    # node:sqlite singleton + schema migrations
  repo.ts                  # typed data-access helpers (goals/sessions/plans/messages)
  minimax.ts               # Anthropic-SDK client → MiniMax Anthropic endpoint
  queue.ts                 # global FIFO concurrency limiter + observable state
  coach.ts                 # system prompts + plan-generation prompt/parse
components/app/            # timer, session recorder, chat, goal cards, sidebar, queue badge
```

### Data layer — `node:sqlite` (built-in, Node 25)
No native dependency. DB file at `.data/abrany.db` (gitignored). A module singleton opens the DB and runs idempotent `CREATE TABLE IF NOT EXISTS` migrations on first import.

**Schema:**
- `goals(id, title, description, status['active'|'archived'|'done'], created_at, updated_at)`
- `plans(id, goal_id, title, summary, created_at)` — one active plan per goal (MVP: latest wins)
- `plan_items(id, plan_id, title, detail, estimate, order_index, status['todo'|'doing'|'done'])`
- `sessions(id, goal_id?, mode['focus'|'break'], started_at, ended_at, duration_sec, notes, tags, created_at)`
- `threads(id, goal_id?, title, created_at)` — coach conversations
- `messages(id, thread_id, role['user'|'assistant'], content, created_at)`
- `settings(key, value)` — timer prefs, queue cap override

### AI layer — MiniMax via Anthropic SDK
Key + endpoint sourced from American Iron config:
`MINIMAX_API_KEY`, base URL `https://api.minimax.io/anthropic/v1`, model `MiniMax-M3` (newest). Stored in `abrany/.env.local` (gitignored). `lib/minimax.ts` builds an `Anthropic` client with `baseURL` + `apiKey` and exposes `stream()`/`complete()` helpers that **go through the queue**.

### Queue — `lib/queue.ts`
A process-global semaphore (default max 2, env `MINIMAX_MAX_CONCURRENCY`). `acquire()` returns a release fn; callers wrapped so every MiniMax call passes through. Tracks `{active, queued}` for `/api/queue`. Retries 429/5xx with exponential backoff (jittered, capped attempts). FIFO ordering via a promise queue. This is per-process; for a single local app that is the correct boundary.

### Coach behavior — `lib/coach.ts`
System prompt establishes a realistic, encouraging coach that: breaks large goals into staged milestones sized to real study time; states honest timelines; proposes checkpoints/assessments; avoids over-promising. `generatePlan(goal)` asks MiniMax for a **structured JSON plan** (title, summary, ordered items with estimates), validated before insert; chat uses streaming text.

## 4. Data flow

- **Timer finish → record:** client timer completes a focus block → opens recorder → `POST /api/sessions` → appears in dashboard + log.
- **Goal → plan:** user opens a goal → "Build my plan" → `POST /api/goals/[id]/plan` → queued MiniMax structured call → plan + items persisted → rendered as a checklist; item checkboxes `PATCH` status.
- **Coach chat:** `POST /api/chat` with thread history → queued streaming MiniMax response streamed to client via `ReadableStream`; both turns persisted.
- **Queue indicator:** sidebar polls `GET /api/queue` (light interval) to show active/queued.

## 5. Error handling
- MiniMax down / no key: API routes return a structured error; UI shows a calm inline notice ("Coach is unavailable"), never crashes the app. Timer/logging/goals all work fully offline without AI.
- Rate limit (429): queue retries with backoff; if exhausted, surfaces "busy, try again".
- DB write failure: route returns 500 with message; client keeps local input so nothing is lost.
- Streaming abort: client `AbortController`; server releases the queue slot in `finally`.

## 6. Testing / verification
- `lib/queue.ts` unit-tested (concurrency never exceeds cap; FIFO order; release-on-throw) via a small Node test script.
- `lib/repo.ts` smoke-tested against an in-memory DB (CRUD round-trips).
- End-to-end manual verification with the app running: start a Pomodoro, record a session, create a goal, generate a plan, chat with the coach, watch the queue indicator — driven in-browser before claiming done.
- `next build` must pass.

## 7. Brand reuse
Reuse existing tokens and classes verbatim: `.glass`, `.glassx`, `.glassx-dark`, `LiquidGlass`, `--color-ink/muted/accent`, `--radius-*`, `--shadow-*`, Archivo display / Inter sans, the `01/02` pager & eyebrow motif. The app shell reads as the same product as the landing — glass sidebar on the soft blue gradient, accent used sparingly for active/primary.

## 8. Later phases (not now)
P2: assessments + scheduled follow-ups. P3: web research (current info) tool. P4: presentation generation. P5: verbal/lecture (TTS) + book-writing. Each its own spec.
