import { NextResponse } from "next/server";
import { listLessons, userOwnsPlanItem } from "@/lib/repo";
import { enqueueLesson } from "@/lib/worker";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Background-generate every not-yet-ready lesson in this milestone. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plan-items/[id]/prepare">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPlanItem(user.id, Number(id))) return forbidden();
  const lessons = listLessons(Number(id));
  const toQueue = lessons.filter((l) => l.status === "stub" || l.status === "error");
  toQueue.forEach((l) => enqueueLesson(l.id));
  return NextResponse.json({ queued: toQueue.length });
}
