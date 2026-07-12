import { NextResponse } from "next/server";
import { getLesson } from "@/lib/repo";
import { enqueueLesson } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Queue a single lesson for background generation. */
export async function POST(_req: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const { id } = await ctx.params;
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lesson.status === "ready") return NextResponse.json({ lesson });
  const job = enqueueLesson(lesson.id);
  return NextResponse.json({ jobId: job.id, status: "queued" }, { status: 202 });
}
