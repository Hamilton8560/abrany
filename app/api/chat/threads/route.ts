import { NextResponse } from "next/server";
import { createThread, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a new conversation in a scope ({ goalId } or general). The old one is kept, just no longer current. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const goalId = body.goalId != null && userOwnsGoal(user.id, Number(body.goalId)) ? Number(body.goalId) : null;
  const threadId = createThread(user.id, goalId);
  return NextResponse.json({ threadId }, { status: 201 });
}
