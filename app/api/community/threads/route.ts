import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { getForumBySlug, listThreads, createThread } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Threads for one forum: ?forum=<slug>. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const slug = new URL(request.url).searchParams.get("forum") ?? "";
  const forum = getForumBySlug(slug);
  if (!forum) return NextResponse.json({ error: "Forum not found" }, { status: 404 });
  return NextResponse.json({ forum, threads: listThreads(forum.id) });
}

/** Start a thread. Body: { forumSlug, title, body }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const forum = getForumBySlug((body.forumSlug ?? "").toString());
  if (!forum) return NextResponse.json({ error: "Forum not found" }, { status: 404 });
  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Give your thread a title" }, { status: 400 });
  const id = createThread(forum.id, user.id, title, (body.body ?? "").toString());
  return NextResponse.json({ threadId: id, threads: listThreads(forum.id) }, { status: 201 });
}
