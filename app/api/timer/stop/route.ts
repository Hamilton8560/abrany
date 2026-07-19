import { NextResponse } from "next/server";
import { stopTimer } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stop the timer early; logs the elapsed focus/reading time if meaningful. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { timer, logged } = stopTimer(user.id);
  return NextResponse.json({ timer, logged });
}
