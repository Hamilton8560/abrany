import { NextResponse } from "next/server";
import { getGoal, getPlanForGoal, createPlan } from "@/lib/repo";
import { generatePlan } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/plan">) {
  const { id } = await ctx.params;
  return NextResponse.json({ plan: getPlanForGoal(Number(id)) ?? null });
}

export async function POST(_req: Request, ctx: RouteContext<"/api/goals/[id]/plan">) {
  const { id } = await ctx.params;
  const goal = getGoal(Number(id));
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const generated = await generatePlan(goal);
    const plan = createPlan(goal.id, generated.title, generated.summary, generated.items);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
