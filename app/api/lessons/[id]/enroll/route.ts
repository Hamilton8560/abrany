import { NextResponse } from "next/server";
import { getLesson, enrollLesson, unenrollLesson } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a lesson to spaced review ("I studied this — follow up with me"). */
export async function POST(_req: Request, ctx: RouteContext<"/api/lessons/[id]/enroll">) {
  const { id } = await ctx.params;
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson: enrollLesson(lesson.id) });
}

/** Remove from spaced review. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/lessons/[id]/enroll">) {
  const { id } = await ctx.params;
  unenrollLesson(Number(id));
  return NextResponse.json({ ok: true });
}
