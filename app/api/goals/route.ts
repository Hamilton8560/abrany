import { NextResponse } from "next/server";
import { listGoals, createGoal } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ goals: listGoals() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const goal = createGoal(title, (body.description ?? "").toString());
  return NextResponse.json({ goal }, { status: 201 });
}
