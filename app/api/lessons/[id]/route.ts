import { NextResponse } from "next/server";
import { getLesson, setLessonCompleted, userOwnsLesson } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
}

/** Mark a section read/done (or clear it). Body: { done: boolean }. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const body = await request.json().catch(() => ({}));
  const lesson = setLessonCompleted(Number(id), !!body.done);
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
}
