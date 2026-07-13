import { NextResponse } from "next/server";
import { getChapter, userOwnsChapter } from "@/lib/repo";
import { enqueueChapter } from "@/lib/worker";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

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

/** Queue a single chapter for background generation. */
export async function POST(_req: Request, ctx: RouteContext<"/api/chapters/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsChapter(user.id, Number(id))) return forbidden();
  const chapter = getChapter(Number(id));
  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (chapter.status === "ready") return NextResponse.json({ chapter });
  const job = enqueueChapter(chapter.id);
  return NextResponse.json({ jobId: job.id, status: "queued" }, { status: 202 });
}
