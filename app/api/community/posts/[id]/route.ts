import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { deletePost } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete your reply (the app owner can delete any). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const ok = deletePost(Number(id), user.id, !!user.is_owner);
  if (!ok) return NextResponse.json({ error: "Not yours to delete" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
