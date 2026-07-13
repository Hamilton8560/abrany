import { NextResponse } from "next/server";
import { listChapters, userOwnsBook } from "@/lib/repo";
import { enqueueChapter } from "@/lib/worker";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Write every not-yet-ready chapter of the book (background). */
export async function POST(_req: Request, ctx: RouteContext<"/api/books/[id]/prepare">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsBook(user.id, Number(id))) return forbidden();
  const chapters = listChapters(Number(id));
  const toQueue = chapters.filter((c) => c.status === "stub" || c.status === "error");
  toQueue.forEach((c) => enqueueChapter(c.id));
  return NextResponse.json({ queued: toQueue.length });
}
