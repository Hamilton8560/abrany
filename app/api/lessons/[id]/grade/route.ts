import { NextResponse } from "next/server";
import { getLesson } from "@/lib/repo";
import { gradeReviewQuiz } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Grade typed answers against the lesson; returns per-question verdicts + a suggested rating. */
export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/grade">) {
  const { id } = await ctx.params;
  const lesson = getLesson(Number(id));
  if (!lesson || !lesson.content) {
    return NextResponse.json({ error: "Lesson not ready" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "No answers" }, { status: 400 });

  try {
    const grade = await gradeReviewQuiz({
      lessonTitle: lesson.title,
      content: lesson.content,
      items: items.map((it: { question?: string; answer?: string }) => ({
        question: (it.question ?? "").toString(),
        answer: (it.answer ?? "").toString(),
      })),
    });
    return NextResponse.json({ grade });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not grade the quiz";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
