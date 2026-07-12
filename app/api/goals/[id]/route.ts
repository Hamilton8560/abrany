import { NextResponse } from "next/server";
import { getGoal, updateGoal, deleteGoal, getPlanForGoal, getChildGoals } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  const goal = getGoal(Number(id));
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const children = getChildGoals(goal.id);
  return NextResponse.json({
    goal,
    children,
    // umbrella goals (with track children) have no plan of their own
    plan: children.length ? null : getPlanForGoal(goal.id) ?? null,
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const goal = updateGoal(Number(id), {
    title: body.title?.toString(),
    description: body.description?.toString(),
    status: body.status,
  });
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ goal });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  deleteGoal(Number(id));
  return NextResponse.json({ ok: true });
}
