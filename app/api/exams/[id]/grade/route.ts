import { NextResponse } from "next/server";
import { getExam, examScope, recordExamAttempt, userOwnsExam, PASS_SCORE } from "@/lib/repo";
import { gradeReviewQuiz } from "@/lib/coach";
import { llmContext, withLlm } from "@/lib/minimax";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Grade a sat exam, record the attempt, and report pass/fail. */
export async function POST(request: Request, ctx: RouteContext<"/api/exams/[id]/grade">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsExam(user.id, Number(id))) return forbidden();
  const exam = getExam(Number(id));
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "No answers" }, { status: 400 });
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  // grade against the actual section content (source of truth)
  const reference = examScope(exam)
    .map((s) => `## ${s.title}\n${s.content}`)
    .join("\n\n")
    .slice(0, 10000);

  try {
    const grade = await withLlm(
      llm.creds,
      () =>
        gradeReviewQuiz({
          lessonTitle: exam.title,
          content: reference || exam.study_guide,
          items: items.map((it: { question?: string; answer?: string }) => ({
            question: (it.question ?? "").toString(),
            answer: (it.answer ?? "").toString(),
          })),
        }),
      user.language,
    );
    const results = grade.results ?? [];
    const score = results.length
      ? Math.round(
          (results.reduce((s, r) => s + (r.verdict === "correct" ? 1 : r.verdict === "partial" ? 0.5 : 0), 0) /
            results.length) *
            100,
        )
      : 0;
    const updated = recordExamAttempt(Number(id), score);
    return NextResponse.json({ grade, score, pass: score >= PASS_SCORE, passScore: PASS_SCORE, exam: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not grade the exam";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
