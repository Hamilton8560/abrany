import { NextResponse } from "next/server";
import { getTimerState, setTimerState } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's live focus timer (shared across all their devices). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ timer: getTimerState(user.id) });
}

/** Persist a timer action (start/pause/reset/switch). Body = the new state. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const b = await request.json().catch(() => ({}));
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const timer = setTimerState(user.id, {
    mode: b.mode === "break" ? "break" : "focus",
    focus_min: Math.min(180, Math.max(1, num(b.focus_min, 25))),
    break_min: Math.min(60, Math.max(1, num(b.break_min, 5))),
    running: b.running ? 1 : 0,
    end_at: b.end_at == null ? null : num(b.end_at),
    left_sec: Math.max(0, num(b.left_sec, 0)),
    focus_accum: Math.max(0, num(b.focus_accum, 0)),
    focus_start: b.focus_start == null ? null : num(b.focus_start),
  });
  return NextResponse.json({ timer });
}
