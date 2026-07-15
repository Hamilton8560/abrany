import { NextResponse } from "next/server";
import { getGoal, getPlanForGoal, createPlan, userOwnsGoal } from "@/lib/repo";
import { generatePlanV2, DEFAULT_INTAKE, type PlanIntake } from "@/lib/coach";
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

/** Generate a V2 plan (outcome-first, time-budgeted). Existing V1 plans are never rewritten. */
export async function POST(req: Request, ctx: RouteContext<"/api/goals/[id]/plan">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsGoal(user.id, Number(id))) return forbidden();
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const goal = getGoal(Number(id))!;

  const body = await req.json().catch(() => ({}));
  const intake: PlanIntake = {
    level: ["new", "some", "solid"].includes(body.level) ? body.level : DEFAULT_INTAKE.level,
    hoursPerWeek: Math.max(1, Math.min(60, Number(body.hoursPerWeek) || DEFAULT_INTAKE.hoursPerWeek)),
    targetDate: typeof body.targetDate === "string" && body.targetDate ? body.targetDate.slice(0, 10) : undefined,
    focus: typeof body.focus === "string" && body.focus.trim() ? body.focus.slice(0, 300) : undefined,
  };

  try {
    const generated = await withLlm(llm.creds, () => generatePlanV2(goal, intake), user.language);
    const plan = createPlan(goal.id, generated.title, generated.summary, generated.items, {
      version: 2,
      intake,
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
