import { NextResponse } from "next/server";
import { getExam, getGoal, examScope, setExamStatus, setExamStudyGuide, userOwnsExam } from "@/lib/repo";
import { generateExam } from "@/lib/coach";
import { llmContext, withLlm } from "@/lib/minimax";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current exam (study guide + status). */
export async function GET(_req: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsExam(user.id, Number(id))) return forbidden();
  const exam = getExam(Number(id));
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ exam });
}

/** Generate (or refresh) the study guide + a fresh question set to sit the exam. */
export async function POST(_req: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsExam(user.id, Number(id))) return forbidden();
  const exam = getExam(Number(id));
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  setExamStatus(Number(id), "generating");
  try {
    const { studyGuide, questions } = await withLlm(
      llm.creds,
      () => generateExam({ goalTitle: goal?.title ?? exam.title, scope: exam.kind, sections }),
      user.language,
    );
    setExamStudyGuide(Number(id), studyGuide);
    return NextResponse.json({ exam: getExam(Number(id)), questions });
  } catch (err) {
    setExamStatus(Number(id), "error", err instanceof Error ? err.message : "generation failed");
    return NextResponse.json({ error: "Could not prepare the exam right now." }, { status: 502 });
  }
}
