import { NextResponse } from "next/server";
import { getGoal, updateGoal, deleteGoal, getPlanForGoal, getChildGoals, goalStats, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  const goal = getGoal(Number(id))!;
  const rawChildren = getChildGoals(goal.id);
  // tracks list needs to show which sibling already has a plan, so a learner
  // can tell where their generated content lives instead of guessing by clicking
  const children = rawChildren.map((c) => {
    const childPlan = getPlanForGoal(c.id);
    const stats = goalStats(c.id);
    return {
      ...c,
      hasPlan: !!childPlan,
      milestones: childPlan?.items.length ?? 0,
      sectionsTotal: stats.sectionsTotal,
      sectionsDone: stats.sectionsDone,
    };
  });
  return NextResponse.json({
    goal,
    children,
    // umbrella goals (with track children) have no plan of their own
    plan: rawChildren.length ? null : getPlanForGoal(goal.id) ?? null,
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  const body = await request.json().catch(() => ({}));
  const goal = updateGoal(Number(id), {
    title: body.title?.toString(),
    description: body.description?.toString(),
    status: body.status,
  });
  return NextResponse.json({ goal });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  deleteGoal(Number(id));
  return NextResponse.json({ ok: true });
}
