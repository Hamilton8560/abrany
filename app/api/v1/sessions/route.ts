import { NextResponse } from "next/server";
import { orgFromRequest, parseDateRange, sessionDaysJson } from "@/lib/orgApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });

/**
 * Partner API: per-member, per-calendar-day focus-session stats.
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive, UTC). Each row is one member on one
 * day: `pomodoros` = completed focus sessions of 25+ minutes (goal-linked or ad-hoc),
 * `focusSec` = total focus seconds that day. A member-day with no focus sessions
 * simply has no row — absence means zero.
 */
export async function GET(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return unauthorized();
  const range = parseDateRange(request.url);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });
  return NextResponse.json({ sessions: sessionDaysJson(org, range.from, range.to) });
}
