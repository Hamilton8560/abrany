import { NextResponse } from "next/server";
import { getLesson, planItemWithContext } from "@/lib/repo";
import { generateReviewQuiz } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generate fresh recall questions for a lesson (queued through MiniMax). */
export async function POST(_req: Request, ctx: RouteContext<"/api/lessons/[id]/quiz">) {
  const { id } = await ctx.params;
  const lesson = getLesson(Number(id));
  if (!lesson || !lesson.content) {
    return NextResponse.json({ error: "Lesson not ready" }, { status: 404 });
  }
  const context = planItemWithContext(lesson.plan_item_id);
  try {
    const questions = await generateReviewQuiz({
      goalTitle: context?.goal.title ?? "",
      lessonTitle: lesson.title,
      lessonObjective: lesson.objective,
      content: lesson.content,
    });
    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build a quiz";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
