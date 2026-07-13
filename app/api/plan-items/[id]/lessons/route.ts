import { NextResponse } from "next/server";
import { listLessons, createLessonStubs, planItemWithContext, userOwnsPlanItem } from "@/lib/repo";
import { expandMilestone } from "@/lib/coach";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/plan-items/[id]/lessons">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPlanItem(user.id, Number(id))) return forbidden();
  return NextResponse.json({ lessons: listLessons(Number(id)) });
}

/** Expand a milestone into lesson stubs (idempotent — returns existing if already expanded). */
export async function POST(_req: Request, ctx: RouteContext<"/api/plan-items/[id]/lessons">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPlanItem(user.id, Number(id))) return forbidden();
  const itemId = Number(id);
  const existing = listLessons(itemId);
  if (existing.length) return NextResponse.json({ lessons: existing });

  const context = planItemWithContext(itemId);
  if (!context) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  try {
    const stubs = await expandMilestone({
      goalTitle: context.goal.title,
      goalDescription: context.goal.description,
      milestoneTitle: context.item.title,
      milestoneDetail: context.item.detail,
    });
    const lessons = createLessonStubs(itemId, stubs);
    return NextResponse.json({ lessons }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not break this into lessons";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
