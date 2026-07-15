import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { userOwnsLesson } from "@/lib/repo";
import { addLessonReadTime } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reading-time heartbeat: the open lesson viewer pings this while visible. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const lessonId = Number(id);
  if (!userOwnsLesson(user.id, lessonId)) return forbidden();
  const body = await request.json().catch(() => ({}));
  addLessonReadTime(lessonId, Number(body.sec) || 0);
  return NextResponse.json({ ok: true });
}
