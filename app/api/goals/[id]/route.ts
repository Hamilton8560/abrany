import { NextResponse } from "next/server";
import { getGoal, updateGoal, deleteGoal, getPlanForGoal, getChildGoals, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  const goal = getGoal(Number(id))!;
  const children = getChildGoals(goal.id);
  return NextResponse.json({
    goal,
    children,
    // umbrella goals (with track children) have no plan of their own
    plan: children.length ? null : getPlanForGoal(goal.id) ?? null,
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
