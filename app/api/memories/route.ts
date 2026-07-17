import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { listMemories, addMemory, type MemoryCategory } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATS = ["preference", "goal", "struggle", "context"];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ memories: listMemories(user.id) });
}

/** The learner adds something they want their tutor to always remember. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const text = (body.text ?? "").toString().trim();
  if (!text) return NextResponse.json({ error: "Say what you want remembered" }, { status: 400 });
  const category = (CATS.includes(body.category) ? body.category : "context") as MemoryCategory;
  addMemory(user.id, text, category, "user");
  return NextResponse.json({ memories: listMemories(user.id) }, { status: 201 });
}
