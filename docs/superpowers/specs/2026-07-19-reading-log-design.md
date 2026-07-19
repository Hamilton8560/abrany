# Reading-Log flow + Amygdala fix — Design

**Date:** 2026-07-19
**Owner:** claude / David
**Status:** proposed

## Context

The "Your Mind" RPG has 5 real, trainable brain regions defined in `lib/mind.ts:12`
(`prefrontal | temporal | hippocampus | cerebellum | association`). Two gaps motivated this work:

1. **Reading is not a first-class training input.** Temporal-lobe (Comprehension) XP only comes from
   `read_sec` on `read`/`teach` lessons (`lib/mind.ts:278`). A user reading a book — in-app or a
   physical/external book — has no way to log that time and earn Temporal XP. In-app books currently
   only count toward *Association* (as "creations"), never as reading.
2. **The landing page advertises a region that does not exist.** `components/BrainJourney.tsx:60`
   shows an **Amygdala** beat (with `/public/regions/amygdala.webp`) that has no `BrainRegionId`, no
   stat, no XP source, and no training path — a visual-only orphan. Meanwhile the real `temporal`
   and `association` regions never appear in that animation.

## Decisions (locked with David)

- **Reading input:** BOTH a **live in-app timer** AND **manual entry** (for external/physical reading).
- **Reading source:** supports in-app books/chapters (FK) AND external books (free-text title).
- **Amygdala:** **Option A (minimal)** — remove the orphaned amygdala beat from the landing journey
  and swap in a real region (**Temporal lobe**, which the new reading feature makes the natural pick).
  The ambitious aMCC "Grit" region is explicitly **out of scope** for this spec (future work).
- **Hippocampus recall bonus:** explicitly **out of scope** for v1 (see Non-goals). Reading feeds
  Temporal only for now.

## Non-goals (v1)

- No aMCC / "Grit" 6th region. (Separate future spec.)
- No post-reading recall → Hippocampus SRS bonus. (Book chapters aren't lessons; wiring SRS to
  arbitrary reading is its own design. Deferred.)
- No changes to the AI coach, lesson generation, or `regionFor()` node mapping.
- No pages-read analytics beyond storing an optional page count.

## Data model

Reuse the existing `sessions` table (the user-facing Training Log already renders it, and
`createSession()` at `lib/repo.ts:553` is the single write path). A reading session is a session with
`mode = 'reading'`.

**Migrations** (idempotent `addCol` pattern, matching `lib/db.ts:348`):

- `sessions.book_id    INTEGER` — nullable FK to `books(id) ON DELETE SET NULL`. Set for in-app books.
- `sessions.chapter_id INTEGER` — nullable FK to `chapters(id) ON DELETE SET NULL`. Optional.
- `timer_states.book_id    INTEGER` — nullable, for persisting a live reading timer.
- `timer_states.chapter_id INTEGER` — nullable.
  (`timer_states.mode` already exists; it gains a `'reading'` value. One active timer per user —
  reading and focus share the single per-user slot. Acceptable; noted as a known limitation.)

**Field usage for a reading session:**

| Field | Meaning |
|-------|---------|
| `mode` | `'reading'` |
| `duration_sec` | minutes read × 60 (from timer, or manual entry) |
| `book_id` / `chapter_id` | set when reading in-app content; both null for external books |
| `tags` | external book title (free text) when `book_id` is null |
| `notes` | optional page count / thoughts |

No new reading-specific column beyond the two FK links (which are genuinely useful).

## Brain mapping

Extend `computeStats()` in `lib/mind.ts` (around `:278`) so **Temporal (Comprehension) XP** =
existing reading-lesson `read_sec` **+** `SUM(duration_sec) FROM sessions WHERE mode='reading'`.
No other region is affected. `regionFor()` is untouched (reading sessions are not "nodes").

## Components / data flow

1. **Manual entry** — a "Log reading" form: pick an in-app book/chapter from a dropdown **or** type an
   external title; enter minutes; optional pages/notes → `POST /api/sessions` with
   `mode='reading'`, `bookId?`, `chapterId?`, `durationSec`, `tags` (external title), `notes`.
2. **Live timer** — select a book/chapter (or external title) → Start. Elapsed time persists across
   reloads via `timer_states` (mode `'reading'`, `book_id`, `chapter_id`). On Finish → creates a
   `mode='reading'` session with the accumulated `durationSec`.
3. **API** — `POST /api/sessions` (`app/api/sessions/route.ts:14`) extends its accepted body with
   `bookId`, `chapterId` (both optional); `createSession()` (`lib/repo.ts:553`) persists them.
4. **Training Log UI** (`app/app/log/page.tsx`) — render reading sessions with a "Reading" label and
   the book title (from FK `books.title` if `book_id` set, else from `tags`).
5. **Your Mind** — Temporal region level rises automatically once `computeStats()` counts reading
   sessions; no dedicated UI change required beyond it reflecting the new XP.

## Amygdala fix (Option A)

- Remove the amygdala beat from `components/BrainJourney.tsx:60` and replace it with a **Temporal
  lobe** beat (Comprehension) that reflects the real model and the new reading feature.
- Leave `/public/regions/amygdala.webp` in place (unused) or delete it — cosmetic; delete to avoid a
  dead asset.
- Result: every region shown to users maps to a real, trainable region.

## Error handling

- `POST /api/sessions` validates `durationSec > 0`; rejects negative/absent.
- `bookId`/`chapterId` that don't exist → FK is `ON DELETE SET NULL`; on insert, treat a
  non-existent id as null rather than erroring (or validate existence and 400). Pick: **validate and
  400** to avoid silent data loss of the user's intent.
- External-title reading with empty `tags` and no `book_id` → allowed (untitled reading), but the UI
  encourages a title.
- Live timer: if a focus timer is already running, starting a reading timer replaces it (shared slot);
  the UI warns before overwriting.

## Testing

- **Unit:** `computeStats()` includes `mode='reading'` session duration in Temporal XP and nothing
  else. A reading session with `book_id` set and one external (title-only) session both count.
- **API:** `POST /api/sessions` with `mode='reading'` + `bookId` persists `book_id`; with external
  title persists `tags`; `durationSec<=0` → 400.
- **Migration:** `addCol` is idempotent — re-running migrations on an existing DB adds columns once.
- **UI (manual):** the log page shows a reading row with the correct book title for both in-app and
  external sources.

## Rollout

Single change set: migrations → repo/API → `computeStats` → reading UI (manual + timer) → log
rendering → BrainJourney swap. No data backfill needed (existing sessions are `focus`/`break`).
