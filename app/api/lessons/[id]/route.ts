import { NextResponse } from "next/server";
import { getLesson, setLessonCompleted, updateLessonFields, deleteLesson, userOwnsLesson } from "@/lib/repo";
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

/** Mark a section read/done ({ done }) and/or edit its title/objective (course editing). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const body = await request.json().catch(() => ({}));
  if (typeof body.title === "string" || typeof body.objective === "string") {
    updateLessonFields(Number(id), {
      title: typeof body.title === "string" ? body.title : undefined,
      objective: typeof body.objective === "string" ? body.objective : undefined,
    });
  }
  const lesson = body.done !== undefined ? setLessonCompleted(Number(id), !!body.done) : getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
}

/** Remove a section from the course (its generated content goes with it). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  deleteLesson(Number(id));
  return NextResponse.json({ ok: true });
}
