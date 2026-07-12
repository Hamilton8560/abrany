import { NextResponse } from "next/server";
import { listSessions, createSession, sessionStats } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sessions: listSessions(), stats: sessionStats() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: "durationSec is required" }, { status: 400 });
  }
  const session = createSession({
    goalId: body.goalId != null ? Number(body.goalId) : null,
    mode: body.mode === "break" ? "break" : "focus",
    durationSec,
    notes: (body.notes ?? "").toString(),
    tags: (body.tags ?? "").toString(),
    startedAt: body.startedAt,
    endedAt: body.endedAt,
  });
  return NextResponse.json({ session, stats: sessionStats() }, { status: 201 });
}
