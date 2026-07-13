import { NextResponse } from "next/server";
import { getLesson, enrollLesson, unenrollLesson, userOwnsLesson } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a lesson to spaced review ("I studied this — follow up with me"). */
export async function POST(_req: Request, ctx: RouteContext<"/api/lessons/[id]/enroll">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson: enrollLesson(lesson.id) });
}

/** Remove from spaced review. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/lessons/[id]/enroll">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  unenrollLesson(Number(id));
  return NextResponse.json({ ok: true });
}
