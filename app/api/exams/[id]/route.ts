import { NextResponse } from "next/server";
import {
  getExam,
  getGoal,
  examScope,
  setExamStatus,
  setExamStudyGuide,
  setExamQuestions,
  examQuestions,
  examEligibility,
  userOwnsExam,
} from "@/lib/repo";
import { generateExam, generateExamQuestions } from "@/lib/coach";
import { llmContext, withLlm } from "@/lib/minimax";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (id: number) => {
  const exam = getExam(id)!;
  return {
    exam: { ...exam, questions: undefined },
    eligibility: examEligibility(exam),
    // a sitting in progress (questions issued, not yet graded) can be resumed after a refresh
    questions: examQuestions(exam),
  };
};

/** Current exam: cached study guide, whether it can be sat yet, and any issued question set. */
export async function GET(_req: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsExam(user.id, Number(id))) return forbidden();
  if (!getExam(Number(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view(Number(id)));
}

/**
 * Two actions:
 *  - { action: "prepare" }  → make sure a study guide exists (generated once, then cached —
 *                             opening the exam no longer costs an AI call every time).
 *  - { action: "start" }    → issue a FRESH question set for a sitting, stored server-side so
 *                             grading measures the questions we asked. Requires eligibility.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsExam(user.id, Number(id))) return forbidden();
  const exam = getExam(Number(id));
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = body.action === "start" ? "start" : "prepare";

  const sections = examScope(exam);
  if (!sections.length) {
    return NextResponse.json(
      { error: "Prepare the course sections first — this exam needs their content." },
      { status: 400 },
    );
  }
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const goal = getGoal(exam.goal_id);
  const goalTitle = goal?.title ?? exam.title;

  if (action === "prepare") {
    if (exam.study_guide.trim()) return NextResponse.json(view(exam.id));
    setExamStatus(exam.id, "generating");
    try {
      const { studyGuide, questions } = await withLlm(
        llm.creds,
        () => generateExam({ goalTitle, scope: exam.kind, sections }),
        user.language,
      );
      setExamStudyGuide(exam.id, studyGuide);
      // keep the first question set on hand so "start" is instant the first time
      setExamQuestions(exam.id, questions.map((q) => q.question));
      return NextResponse.json(view(exam.id));
    } catch (err) {
      setExamStatus(exam.id, "error", err instanceof Error ? err.message : "generation failed");
      return NextResponse.json({ error: "Could not prepare the study guide right now." }, { status: 502 });
    }
  }

  // start a sitting
  const eligibility = examEligibility(exam);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibility.reason, eligibility }, { status: 403 });
  }
  // the pre-generated first set is used once; every later sitting gets fresh questions
  const stored = examQuestions(exam);
  if (stored.length && exam.attempts === 0 && !body.fresh) return NextResponse.json(view(exam.id));
  try {
    const questions = await withLlm(
      llm.creds,
      () => generateExamQuestions({ goalTitle, scope: exam.kind, sections, studyGuide: exam.study_guide }),
      user.language,
    );
    setExamQuestions(exam.id, questions.map((q) => q.question));
    return NextResponse.json(view(exam.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write the exam questions right now." },
      { status: 502 },
    );
  }
}
