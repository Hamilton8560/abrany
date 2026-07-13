import { NextResponse } from "next/server";
import { getLesson, userOwnsLesson } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lesson });
}
