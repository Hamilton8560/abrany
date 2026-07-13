import { NextResponse } from "next/server";
import { listGoals, createGoal } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ goals: listGoals(user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));

  // Bulk-create selected tracks under a parent umbrella goal.
  if (Array.isArray(body.tracks) && body.tracks.length) {
    const parentTitle = (body.title ?? "").toString().trim();
    if (!parentTitle) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const parent = createGoal(user.id, parentTitle, (body.description ?? "").toString());
    const children = (body.tracks as { title?: string; description?: string }[])
      .filter((t) => t && (t.title ?? "").toString().trim())
      .map((t) => createGoal(user.id, t.title!.toString().trim(), (t.description ?? "").toString(), parent.id));
    return NextResponse.json({ goal: parent, children }, { status: 201 });
  }

  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const parentGoalId = body.parentGoalId != null ? Number(body.parentGoalId) : null;
  const goal = createGoal(user.id, title, (body.description ?? "").toString(), parentGoalId);
  return NextResponse.json({ goal }, { status: 201 });
}
