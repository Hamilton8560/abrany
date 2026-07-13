import { NextResponse } from "next/server";
import { getLesson, setLessonGrade, userOwnsLesson } from "@/lib/repo";
import { gradeReviewQuiz } from "@/lib/coach";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Grade typed answers against the lesson; returns per-question verdicts + a suggested rating. */
export async function POST(request: Request, ctx: RouteContext<"/api/lessons/[id]/grade">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const lesson = getLesson(Number(id));
  if (!lesson || !lesson.content) {
    return NextResponse.json({ error: "Lesson not ready" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "No answers" }, { status: 400 });
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  try {
    const grade = await withLlm(
      llm.creds,
      () =>
        gradeReviewQuiz({
          lessonTitle: lesson.title,
          content: lesson.content,
          items: items.map((it: { question?: string; answer?: string }) => ({
            question: (it.question ?? "").toString(),
            answer: (it.answer ?? "").toString(),
          })),
        }),
      user.language,
    );
    // persist a letter grade for the transcript, from the per-question verdicts
    const results = (grade as { results?: { verdict?: string }[] })?.results ?? [];
    if (results.length) {
      const score =
        results.reduce((s, r) => s + (r.verdict === "correct" ? 1 : r.verdict === "partial" ? 0.5 : 0), 0) /
        results.length;
      const pct = Math.round(score * 100);
      const letter = pct >= 93 ? "A" : pct >= 85 ? "A−" : pct >= 78 ? "B+" : pct >= 70 ? "B" : pct >= 60 ? "C+" : pct >= 50 ? "C" : "D";
      setLessonGrade(Number(id), letter);
    }
    return NextResponse.json({ grade });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not grade the quiz";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
