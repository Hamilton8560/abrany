import { NextResponse } from "next/server";
import {
  listStudyGuides,
  createStudyGuide,
  getGoal,
  getPlanItem,
  userOwnsGoal,
  userOwnsPlanItem,
} from "@/lib/repo";
import { enqueueStudyGuide } from "@/lib/worker";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { llmContext } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ guides: listStudyGuides(user.id) });
}

/**
 * Create a study guide.
 * - { content, title }              → save an existing guide (e.g. from an exam), stored ready.
 * - { goalId }                      → guide for a whole course, grounded in its lessons.
 * - { planItemId }                  → guide for one milestone.
 * - { topic }                       → standalone guide on a topic.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));

  // Save an already-written guide (no generation needed).
  if (typeof body.content === "string" && body.content.trim()) {
    const goalId = body.goalId != null && userOwnsGoal(user.id, Number(body.goalId)) ? Number(body.goalId) : null;
    const guide = createStudyGuide({
      userId: user.id,
      title: (body.title ?? "Study guide").toString().trim() || "Study guide",
      topic: (body.topic ?? "").toString(),
      goalId,
      source: body.source === "exam" ? "exam" : "topic",
      content: body.content,
    });
    return NextResponse.json({ guide }, { status: 201 });
  }

  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  // Milestone-scoped
  if (body.planItemId != null) {
    const planItemId = Number(body.planItemId);
    if (!userOwnsPlanItem(user.id, planItemId))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const item = getPlanItem(planItemId);
    const guide = createStudyGuide({
      userId: user.id,
      title: (body.title ?? item?.title ?? "Study guide").toString().trim(),
      planItemId,
      source: "milestone",
    });
    enqueueStudyGuide(guide.id, user.id);
    return NextResponse.json({ guide }, { status: 201 });
  }

  // Goal-scoped
  if (body.goalId != null) {
    const goalId = Number(body.goalId);
    if (!userOwnsGoal(user.id, goalId))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const goal = getGoal(goalId);
    const guide = createStudyGuide({
      userId: user.id,
      title: (body.title ?? (goal ? `Study guide — ${goal.title}` : "Study guide")).toString().trim(),
      goalId,
      source: "goal",
    });
    enqueueStudyGuide(guide.id, user.id);
    return NextResponse.json({ guide }, { status: 201 });
  }

  // Free topic
  const topic = (body.topic ?? "").toString().trim();
  if (!topic) return NextResponse.json({ error: "Give a topic, or pick a course/milestone" }, { status: 400 });
  const guide = createStudyGuide({
    userId: user.id,
    title: (body.title ?? topic).toString().trim().slice(0, 160),
    topic,
    source: "topic",
  });
  enqueueStudyGuide(guide.id, user.id);
  return NextResponse.json({ guide }, { status: 201 });
}
