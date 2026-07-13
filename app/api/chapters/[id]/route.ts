import { NextResponse } from "next/server";
import { getChapter } from "@/lib/repo";
import { enqueueChapter } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/chapters/[id]">) {
  const { id } = await ctx.params;
  const chapter = getChapter(Number(id));
  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ chapter });
}

/** Queue a single chapter for background generation. */
export async function POST(_req: Request, ctx: RouteContext<"/api/chapters/[id]">) {
  const { id } = await ctx.params;
  const chapter = getChapter(Number(id));
  if (!chapter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (chapter.status === "ready") return NextResponse.json({ chapter });
  const job = enqueueChapter(chapter.id);
  return NextResponse.json({ jobId: job.id, status: "queued" }, { status: 202 });
}
