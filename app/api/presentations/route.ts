import { NextResponse } from "next/server";
import { listPresentations, createPresentation, userOwnsGoal } from "@/lib/repo";
import { enqueuePresentation } from "@/lib/worker";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { llmContext } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ presentations: listPresentations(user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const topic = (body.topic ?? "").toString().trim();
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const goalId = body.goalId != null && userOwnsGoal(user.id, Number(body.goalId)) ? Number(body.goalId) : null;
  const pres = createPresentation(user.id, topic.slice(0, 140), topic, goalId);
  enqueuePresentation(pres.id, user.id);
  return NextResponse.json({ presentation: pres }, { status: 201 });
}
