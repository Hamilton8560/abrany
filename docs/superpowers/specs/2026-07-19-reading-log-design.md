# Global Focus Timer + Reading Logging + Amygdala fix — Design

**Date:** 2026-07-19
**Owner:** claude / David
**Status:** proposed

## Context

Two product gaps, unified under one theme: **the focus timer should be the central training
instrument** — always visible, notifying you when a block ends, and the thing users are nudged to
start whenever they begin an activity like reading.

### What exists today (verified in code)

The timer engine (`components/app/PomodoroTimer.tsx`) is solid: server-authoritative wall-clock, one
live timer per user in `timer_states` (`lib/db.ts:94`), derived from an absolute end-timestamp so it
survives reloads and syncs across devices via 4s polling (`PomodoroTimer.tsx:144-159`).

**But three expected things are missing:**

1. **Not present.** `PomodoroTimer` is mounted only on the dashboard home (`app/app/page.tsx:55`) and
   `/app/timer` (`app/app/timer/page.tsx:21`). It is **not in the app layout/sidebar**, so it vanishes
   from view on every other page. It keeps counting server-side, but the user can't see it — the
   "I thought I built this but I don't see it."
2. **No end notification.** There is **no sound, no Web Notification, no vibrate** anywhere. On
   completion it only flips `recording=true` to show the log modal (`PomodoroTimer.tsx:64-75`) — and
   only if the component is mounted on screen. On any other page/tab, the block ends silently. The only
   notifications in the app are email (certs/weekly report).
3. **No activity nudge.** Nothing prompts a user to start a focus block when they open a book/lesson.

### Brain-model gaps (unchanged from prior analysis)

- Reading a book (in-app or external/physical) has no logging path; in-app books only credit
  *Association*, never reading time → *Temporal* (`lib/mind.ts:278`).
- The landing page advertises an **Amygdala** region (`components/BrainJourney.tsx:60`) with no
  `BrainRegionId`, no stat, no training path — a visual-only orphan.

## Decisions

**Locked with David:**
- Enhance the **existing focus timer** — do NOT build a separate reading timer.
- The timer must be **present everywhere** and **notify when it ends**.
- When a user starts reading (or similar activity), **nudge them to start a focus block**.
- **Amygdala:** Option A — remove the orphaned beat, swap in a real region (**Temporal lobe**).

**Defaults chosen while David was away (flagged for review — veto any):**
- **Notification scope:** in-app alert + chime + **OS notification via the Web Notification API**
  while the browser is open. NOT true web-push/PWA (deferred as overkill).
- **Region for a reading-tagged block:** credits **Temporal (Comprehension)**. A generic (untagged)
  focus block still credits **Prefrontal (Focus)**. One region per block — no double-count.
- **Presentation:** a compact **persistent timer pill** in the app chrome (visible on every `/app`
  page) + the existing full ring view on the dashboard and `/app/timer`, both reading one shared
  state.
- **Notification-permission ask:** on the user's **first timer start**, not on page load.

## Non-goals (v1)

- No true web-push / service worker / PWA install (deferred).
- No aMCC "Grit" 6th region (separate future spec).
- No post-reading recall → Hippocampus SRS bonus (deferred).
- No changes to the AI coach, lesson generation, or `regionFor()` node mapping.

## Architecture

### 1. Shared timer state (refactor for isolation)

Extract the timer state machine out of `PomodoroTimer` into a **`TimerProvider`** (React context) +
`useTimer()` hook, mounted once in the app layout (`app/app/layout.tsx`). This is the key structural
change: today `PomodoroTimer` owns all state, so nothing off-screen can react to the timer finishing.

- `TimerProvider` owns: server sync (single poller, replacing per-component polling), the
  running-block refs, `finish()`, and firing notifications.
- `PomodoroTimer` (full ring) and a new `TimerPill` (compact) both become thin consumers of
  `useTimer()` — one source of truth, one poller.
- Boundary test: the provider exposes `{ mode, left, running, elapsed, start, pause, reset, ...,
  attachActivity }`. Consumers never touch refs or `/api/timer` directly.

### 2. Presence — `TimerPill`

A compact always-visible control rendered in the app chrome (sidebar footer on desktop, in
`MobileBar` on mobile). Shows live `mm:ss`, mode color, and a play/pause tap. Clicking it routes to
`/app/timer` for the full view. Hidden only when no timer has ever been set (idle + zero), or shown as
a subtle "Start a block" affordance — decide during build.

### 3. End notification (fires from the provider, page-independent)

On `finish()` — including the two existing completion paths (`recompute`→`finish` and the
load-time recovery at `PomodoroTimer.tsx:93-106`, which move into the provider):

1. **Chime** — `new Audio(<short asset>)`, best-effort (may be blocked until first user gesture;
   acceptable).
2. **OS notification** — `new Notification("Focus block done", …)` when `Notification.permission ===
   "granted"`.
3. **Tab-title flash** — set `document.title = "⏰ Time! — Abrany"`, restore on focus.
4. **In-app alert** — the existing log modal / a toast, shown wherever the user is (the pill can host
   it).

Permission is requested on first `start()` (a user gesture), storing nothing server-side.

### 4. Activity nudge

On activity pages (book/chapter reader first; lessons/coach optional), if `!running`, render a
lightweight banner: **"Reading? Start a focus block →"**. Clicking calls
`start()` + `attachActivity({ bookId, chapterId })` so the resulting session is a reading session.

### 5. Reading logging (through the timer + manual)

- **Via timer:** `attachActivity` records `book_id`/`chapter_id` onto the timer (persisted in
  `timer_states`). On completion the recorder defaults to a **reading** session (`mode='reading'`,
  `book_id`, `chapter_id`) → Temporal.
- **Manual (external/physical):** a "Log reading" form → `POST /api/sessions` with `mode='reading'`,
  free-text title in `tags`, minutes in `duration_sec`, optional pages/notes in `notes`.

## Data model

Idempotent `addCol` migrations (pattern at `lib/db.ts:348`):

- `sessions.book_id    INTEGER` — nullable FK `books(id) ON DELETE SET NULL`.
- `sessions.chapter_id INTEGER` — nullable FK `chapters(id) ON DELETE SET NULL`.
- `timer_states.book_id    INTEGER` — nullable, persists the active block's reading target.
- `timer_states.chapter_id INTEGER` — nullable.
  (`timer_states.mode` already exists; a reading block is still stored as a normal running timer —
  the book link, not the mode, marks it as reading. One active timer per user; reading and focus
  share the single slot — a known, accepted limitation.)

Reading session field usage: `mode='reading'`; `duration_sec` = seconds; `book_id`/`chapter_id` set
for in-app content (both null for external); `tags` = external title when unlinked; `notes` =
pages/thoughts.

## Brain mapping

Extend `computeStats()` (`lib/mind.ts` ~`:278`) so **Temporal XP** = existing reading-lesson
`read_sec` **+** `SUM(duration_sec) FROM sessions WHERE mode='reading'`. Prefrontal continues to sum
`mode='focus'` sessions (`lib/mind.ts:269-271`) — reading sessions are excluded from it, preserving
one-region-per-block. `regionFor()` untouched.

## Amygdala fix (Option A)

Replace the amygdala beat in `components/BrainJourney.tsx:60` with a **Temporal lobe**
(Comprehension) beat reflecting the real model and the new reading feature. Delete the now-unused
`/public/regions/amygdala.webp`.

## Error handling

- `POST /api/sessions`: validate `durationSec > 0` → else 400. Non-existent `bookId`/`chapterId` →
  validate and 400 (avoid silently dropping the user's intent).
- Notification: if permission denied or `Notification` unavailable, degrade to in-app + chime +
  title-flash only. Never block the finish path on a notification error.
- Audio autoplay blocked (no prior gesture) → swallow; the in-app alert + title-flash still fire.
- Starting a timer while another block runs (e.g. focus while a reading block is live) replaces it
  (shared slot); the pill/UI warns before overwriting.

## Testing

- **Provider unit:** `finish()` fires notification hooks once; load-time recovery of a block that
  completed while away also fires them; `attachActivity` persists to `timer_states`.
- **computeStats unit:** `mode='reading'` duration counts toward Temporal and NOT Prefrontal; a
  linked and an external reading session both count.
- **API:** `POST /api/sessions` persists `book_id` (linked) / `tags` (external); `durationSec<=0`
  → 400.
- **Migration:** `addCol` idempotent on re-run.
- **UI:** the pill shows live countdown on a non-timer page; the reading nudge appears only when idle;
  the log page renders reading rows with the correct title (linked vs external).

## Build order (phased; could split into two plans)

1. Migrations + repo/API (`book_id`/`chapter_id`, reading mode).
2. `TimerProvider` refactor (extract from `PomodoroTimer`, mount in layout, single poller).
3. End notifications (chime + Web Notification + title-flash + in-app), permission on first start.
4. `TimerPill` presence in app chrome.
5. Activity nudge + `attachActivity` on the book/chapter reader.
6. Manual "Log reading" form + Training Log rendering.
7. `computeStats` Temporal update.
8. Amygdala → Temporal swap in `BrainJourney`.
