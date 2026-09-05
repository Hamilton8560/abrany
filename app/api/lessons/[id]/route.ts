import { NextResponse } from "next/server";
import { getLesson, setLessonCompleted, updateLessonFields, deleteLesson, userOwnsLesson, autoEnrollLesson, goalIdOfLesson } from "@/lib/repo";
import { goalIsLocked } from "@/lib/org";
import { prefetchAround } from "@/lib/worker";
import { resolveUserLlm } from "@/lib/minimax";

const LOCKED = () =>
  NextResponse.json({ error: "This course was assigned by your company and its structure can't be edited." }, { status: 403 });
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
  return NextResponse.json({ lesson, goalId: goalIdOfLesson(lesson.id) ?? null });
}

/** Mark a section read/done ({ done }) and/or edit its title/objective (course editing). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const body = await request.json().catch(() => ({}));
  if (typeof body.title === "string" || typeof body.objective === "string") {
    if (goalIsLocked(goalIdOfLesson(Number(id)))) return LOCKED();
    updateLessonFields(Number(id), {
      title: typeof body.title === "string" ? body.title : undefined,
      objective: typeof body.objective === "string" ? body.objective : undefined,
    });
  }
  let enrolled = false;
  if (body.done !== undefined) {
    const updated = setLessonCompleted(Number(id), !!body.done);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.done === true) {
      enrolled = autoEnrollLesson(Number(id)).enrolled;
      // keep the material one milestone ahead of the learner
      if (resolveUserLlm(user).mode !== "nokey") prefetchAround(updated.plan_item_id, user.id);
    }
    return NextResponse.json({ lesson: updated, enrolled });
  }
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
}

/** Remove a section from the course (its generated content goes with it). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  if (goalIsLocked(goalIdOfLesson(Number(id)))) return LOCKED();
  deleteLesson(Number(id));
  return NextResponse.json({ ok: true });
}
