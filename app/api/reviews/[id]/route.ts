import { NextResponse } from "next/server";
import { getLesson, saveReview, userOwnsLesson, logReview } from "@/lib/repo";
import { schedule, type Rating } from "@/lib/srs";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

/** Grade a review: apply SM-2 and reschedule the lesson. */
export async function POST(request: Request, ctx: RouteContext<"/api/reviews/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsLesson(user.id, Number(id))) return forbidden();
  const lesson = getLesson(Number(id));
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const rating = body.rating as Rating;
  if (!RATINGS.includes(rating)) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const next = schedule(
    { interval: lesson.srs_interval, ease: lesson.srs_ease, reps: lesson.srs_reps },
    rating,
  );
  saveReview(lesson.id, next);
  const recallText = typeof body.recall_text === "string" ? body.recall_text : "";
  const verdict = typeof body.verdict === "string" ? body.verdict : "";
  if (recallText) logReview({ lessonId: lesson.id, userId: user.id, recallText, rating, verdict });
  return NextResponse.json({ next });
}
