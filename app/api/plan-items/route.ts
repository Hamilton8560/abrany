import { NextResponse } from "next/server";
import { getPlanForGoal, addPlanItem, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Course editing: append a new milestone to a goal's plan. Body: { goalId, title, detail? }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const goalId = Number(body.goalId);
  if (!goalId || !userOwnsGoal(user.id, goalId)) return forbidden();
  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Milestone title is required" }, { status: 400 });
  const plan = getPlanForGoal(goalId);
  if (!plan) return NextResponse.json({ error: "This goal has no plan yet" }, { status: 400 });
  const item = addPlanItem(plan.id, title, (body.detail ?? "").toString());
  return NextResponse.json({ item }, { status: 201 });
}
