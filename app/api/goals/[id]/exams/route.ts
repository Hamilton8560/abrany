import { NextResponse } from "next/server";
import { ensureExams, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The midterm + final for this goal (created on first read if the plan warrants). */
export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/exams">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const goalId = Number(id);
  if (!userOwnsGoal(user.id, goalId)) return forbidden();
  return NextResponse.json({ exams: ensureExams(goalId) });
}
