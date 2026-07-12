import { NextResponse } from "next/server";
import { listLessons } from "@/lib/repo";
import { enqueueLesson } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Background-generate every not-yet-ready lesson in this milestone. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plan-items/[id]/prepare">) {
  const { id } = await ctx.params;
  const lessons = listLessons(Number(id));
  const toQueue = lessons.filter((l) => l.status === "stub" || l.status === "error");
  toQueue.forEach((l) => enqueueLesson(l.id));
  return NextResponse.json({ queued: toQueue.length });
}
