import { NextResponse } from "next/server";
import {
  setTimerState,
  finalizeTimerIfDue,
  userOwnsBook,
  userOwnsChapter,
  getChapter,
} from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's live focus timer (shared across all their devices). Reading it
 *  finalizes a block whose deadline has passed — logging its session once. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { timer, justCompleted } = finalizeTimerIfDue(user.id);
  return NextResponse.json({ timer, justCompleted });
}

/** Persist a timer action (start/pause/reset/switch). Body = the new state. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const b = await request.json().catch(() => ({}));
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

  // a running focus block may be tagged with a book/chapter the user is
  // reading; only attach content they actually own (else log it as plain focus)
  let bookId: number | null = null;
  let chapterId: number | null = null;
  if (b.chapter_id != null && userOwnsChapter(user.id, Number(b.chapter_id))) {
    chapterId = Number(b.chapter_id);
    bookId = getChapter(chapterId)?.book_id ?? null;
  } else if (b.book_id != null && userOwnsBook(user.id, Number(b.book_id))) {
    bookId = Number(b.book_id);
  }

  const timer = setTimerState(user.id, {
    mode: b.mode === "break" ? "break" : "focus",
    focus_min: Math.min(180, Math.max(1, num(b.focus_min, 25))),
    break_min: Math.min(60, Math.max(1, num(b.break_min, 5))),
    running: b.running ? 1 : 0,
    end_at: b.end_at == null ? null : num(b.end_at),
    left_sec: Math.max(0, num(b.left_sec, 0)),
    focus_accum: Math.max(0, num(b.focus_accum, 0)),
    focus_start: b.focus_start == null ? null : num(b.focus_start),
    book_id: bookId,
    chapter_id: chapterId,
  });
  return NextResponse.json({ timer });
}
