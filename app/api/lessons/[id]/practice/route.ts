import { NextResponse } from "next/server";
import { getLesson, planItemWithContext, userOwnsLesson } from "@/lib/repo";
import { createPracticeSet, latestPracticeSet, practiceSetView as setView } from "@/lib/practice";
import { generatePracticeSet } from "@/lib/coach";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The learner's current practice set for this lesson (null if none yet). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const set = latestPracticeSet(Number(id), user.id);
  return NextResponse.json({ set: set ? setView(set.id) : null });
}

/** Start practice: returns the in-progress set, or generates a fresh one ({ fresh: true } forces new). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const lesson = getLesson(Number(id));
  if (!lesson || !lesson.content) return NextResponse.json({ error: "Lesson not ready" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const existing = latestPracticeSet(lesson.id, user.id);
  if (existing && existing.status === "ready" && !body.fresh) return NextResponse.json({ set: setView(existing.id) });

  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const context = planItemWithContext(lesson.plan_item_id);
  let level: "new" | "some" | "solid" | undefined;
  try {
    level = context?.plan.intake ? JSON.parse(context.plan.intake).level : undefined;
  } catch {
    /* legacy */
  }
  try {
    const problems = await withLlm(
      llm.creds,
      () =>
        generatePracticeSet({
          goalTitle: context?.goal.title ?? "",
          lessonTitle: lesson.title,
          lessonObjective: lesson.objective,
          kind: lesson.kind,
          content: lesson.content,
          level,
        }),
      user.language,
    );
    const set = createPracticeSet(lesson.id, user.id, problems);
    return NextResponse.json({ set: setView(set.id) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build a practice set" },
      { status: 502 },
    );
  }
}
