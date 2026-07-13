import { NextResponse } from "next/server";
import { listChapters } from "@/lib/repo";
import { enqueueChapter } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Write every not-yet-ready chapter of the book (background). */
export async function POST(_req: Request, ctx: RouteContext<"/api/books/[id]/prepare">) {
  const { id } = await ctx.params;
  const chapters = listChapters(Number(id));
  const toQueue = chapters.filter((c) => c.status === "stub" || c.status === "error");
  toQueue.forEach((c) => enqueueChapter(c.id));
  return NextResponse.json({ queued: toQueue.length });
}
