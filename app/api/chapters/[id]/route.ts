import { NextResponse } from "next/server";
import { getChapter, userOwnsChapter } from "@/lib/repo";
import { enqueueChapter } from "@/lib/worker";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { llmContext } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/chapters/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsChapter(user.id, Number(id))) return forbidden();
  const chapter = getChapter(Number(id));
  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ chapter });
}

/**
 * Queue a single chapter for background generation. By default a chapter that's
 * already written is left alone; pass { force: true } to REWRITE it (e.g. an
 * older chapter that was truncated before the token cap was raised).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/chapters/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsChapter(user.id, Number(id))) return forbidden();
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const chapter = getChapter(Number(id));
  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (chapter.status === "ready" && !body.force) return NextResponse.json({ chapter });
  const job = enqueueChapter(chapter.id, user.id);
  return NextResponse.json({ jobId: job.id, status: "queued" }, { status: 202 });
}
