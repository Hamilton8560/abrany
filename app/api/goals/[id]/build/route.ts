import { NextResponse } from "next/server";
import { getGoal, userOwnsGoal } from "@/lib/repo";
import { enqueueBuildCourse } from "@/lib/worker";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { llmContext } from "@/lib/minimax";
import type { PlanIntake } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Build the whole course in the background: plan (if missing) → every milestone's
 * sections → exams → all section content. One click instead of expanding and
 * preparing each milestone by hand. Idempotent while a build is in flight.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const goalId = Number(id);
  if (!userOwnsGoal(user.id, goalId)) return forbidden();
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const goal = getGoal(goalId);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const intake: Partial<PlanIntake> = {};
  if (["new", "some", "solid"].includes(body.level)) intake.level = body.level;
  if (Number(body.hoursPerWeek) > 0) intake.hoursPerWeek = Math.max(1, Math.min(60, Number(body.hoursPerWeek)));
  if (typeof body.targetDate === "string" && body.targetDate) intake.targetDate = body.targetDate.slice(0, 10);
  if (typeof body.focus === "string" && body.focus.trim()) intake.focus = body.focus.slice(0, 300);

  const job = enqueueBuildCourse(goalId, user.id, intake);
  return NextResponse.json({ jobId: job.id, goal: getGoal(goalId) }, { status: 202 });
}

/** Current build state (the goal page polls this while a build runs). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  const goal = getGoal(Number(id));
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: goal.build_status, error: goal.build_error });
}
