import { NextResponse } from "next/server";
import {
  listSessions,
  createSession,
  sessionStats,
  userOwnsGoal,
  userOwnsBook,
  userOwnsChapter,
  getChapter,
} from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ sessions: listSessions(user.id), stats: sessionStats(user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: "durationSec is required" }, { status: 400 });
  }
  const mode = body.mode === "break" ? "break" : body.mode === "reading" ? "reading" : "focus";

  // only attach a goal the user actually owns
  const goalId = body.goalId != null && userOwnsGoal(user.id, Number(body.goalId)) ? Number(body.goalId) : null;

  // reading sessions may link an in-app book/chapter the user owns; anything
  // they don't own is rejected rather than silently dropped
  let bookId: number | null = null;
  let chapterId: number | null = null;
  if (mode === "reading") {
    if (body.chapterId != null) {
      chapterId = Number(body.chapterId);
      if (!userOwnsChapter(user.id, chapterId)) {
        return NextResponse.json({ error: "chapter not found" }, { status: 400 });
      }
      // a chapter implies its parent book
      bookId = getChapter(chapterId)?.book_id ?? null;
    } else if (body.bookId != null) {
      bookId = Number(body.bookId);
      if (!userOwnsBook(user.id, bookId)) {
        return NextResponse.json({ error: "book not found" }, { status: 400 });
      }
    }
  }

  const session = createSession({
    userId: user.id,
    goalId,
    mode,
    durationSec,
    notes: (body.notes ?? "").toString(),
    tags: (body.tags ?? "").toString(),
    bookId,
    chapterId,
    startedAt: body.startedAt,
    endedAt: body.endedAt,
  });
  return NextResponse.json({ session, stats: sessionStats(user.id) }, { status: 201 });
}
