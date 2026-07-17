import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { deleteMemory, listMemories } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forget something — the learner stays in control of their own memory. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  deleteMemory(user.id, Number(id));
  return NextResponse.json({ memories: listMemories(user.id) });
}
