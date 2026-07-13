import { NextResponse } from "next/server";
import { listPresentations, createPresentation } from "@/lib/repo";
import { enqueuePresentation } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ presentations: listPresentations() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const topic = (body.topic ?? "").toString().trim();
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  const goalId = body.goalId != null ? Number(body.goalId) : null;
  const pres = createPresentation(topic.slice(0, 140), topic, goalId);
  enqueuePresentation(pres.id);
  return NextResponse.json({ presentation: pres }, { status: 201 });
}
