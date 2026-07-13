import { NextResponse } from "next/server";
import { listSessions, createSession, sessionStats, userOwnsGoal } from "@/lib/repo";
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
  // only attach a goal the user actually owns
  const goalId = body.goalId != null && userOwnsGoal(user.id, Number(body.goalId)) ? Number(body.goalId) : null;
  const session = createSession({
    userId: user.id,
    goalId,
    mode: body.mode === "break" ? "break" : "focus",
    durationSec,
    notes: (body.notes ?? "").toString(),
    tags: (body.tags ?? "").toString(),
    startedAt: body.startedAt,
    endedAt: body.endedAt,
  });
  return NextResponse.json({ session, stats: sessionStats(user.id) }, { status: 201 });
}
