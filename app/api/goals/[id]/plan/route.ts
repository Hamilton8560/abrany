import { NextResponse } from "next/server";
import { getGoal, getPlanForGoal, createPlan, userOwnsGoal } from "@/lib/repo";
import { generatePlan } from "@/lib/coach";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/plan">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  return NextResponse.json({ plan: getPlanForGoal(Number(id)) ?? null });
}

export async function POST(_req: Request, ctx: RouteContext<"/api/goals/[id]/plan">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const goal = getGoal(Number(id))!;
  try {
    const generated = await withLlm(llm.creds, () => generatePlan(goal), user.language);
    const plan = createPlan(goal.id, generated.title, generated.summary, generated.items);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
