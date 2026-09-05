import { NextResponse } from "next/server";
import {
  getExam,
  examScope,
  examQuestions,
  examEligibility,
  setExamQuestions,
  recordExamAttempt,
  userOwnsExam,
  PASS_SCORE,
} from "@/lib/repo";
import { gradeReviewQuiz } from "@/lib/coach";
import { llmContext, withLlm } from "@/lib/minimax";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Spread a character budget across every section so the grader sees the WHOLE course, not just its start. */
function buildReference(sections: { title: string; content: string }[], budget: number): string {
  if (!sections.length) return "";
  const per = Math.max(400, Math.floor(budget / sections.length));
  return sections.map((s) => `## ${s.title}\n${s.content.slice(0, per)}`).join("\n\n");
}

/**
 * Grade a sitting. Answers are matched BY INDEX to the question set the server issued
 * (see POST /api/exams/[id] action "start"); question text from the client is ignored,
 * so a client can't grade itself against easier questions.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/exams/[id]/grade">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsExam(user.id, Number(id))) return forbidden();
  const exam = getExam(Number(id));
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const eligibility = examEligibility(exam);
  if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason, eligibility }, { status: 403 });

  const questions = examQuestions(exam);
  if (!questions.length) return NextResponse.json({ error: "Start the exam first." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const rawAnswers: unknown[] = Array.isArray(body.answers)
    ? body.answers
    : Array.isArray(body.items)
      ? (body.items as { answer?: unknown }[]).map((it) => it?.answer)
      : [];
  const items = questions.map((q, i) => ({ question: q, answer: (rawAnswers[i] ?? "").toString().slice(0, 4000) }));
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  const sections = examScope(exam);
  const reference = [exam.study_guide ? `# Study guide\n${exam.study_guide.slice(0, 6000)}` : "", buildReference(sections, 22000)]
    .filter(Boolean)
    .join("\n\n");

  try {
    const grade = await withLlm(
      llm.creds,
      () =>
        gradeReviewQuiz({
          lessonTitle: exam.title,
          content: reference,
          items,
          maxRef: 30000,
          mode: "exam",
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
    // the sitting is over — clear the issued set so a retake must ask for fresh questions
    setExamQuestions(Number(id), []);
    return NextResponse.json({
      grade,
      questions,
      score,
      pass: score >= PASS_SCORE,
      passScore: PASS_SCORE,
      exam: updated ? { ...updated, questions: undefined } : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not grade the exam";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
