import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { getThread, addPost, deleteThread } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const thread = getThread(Number(id));
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  return NextResponse.json({ thread });
}

/** Reply to a thread. Body: { body }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const thread = getThread(Number(id));
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const text = (body.body ?? "").toString().trim();
  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 });
  addPost(thread.id, user.id, text);
  return NextResponse.json({ thread: getThread(thread.id) }, { status: 201 });
}

/** Delete your thread (the app owner can delete any). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const ok = deleteThread(Number(id), user.id, !!user.is_owner);
  if (!ok) return NextResponse.json({ error: "Not yours to delete" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
