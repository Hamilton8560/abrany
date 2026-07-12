import { NextResponse } from "next/server";
import { getLesson, saveReview } from "@/lib/repo";
import { schedule, type Rating } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

/** Grade a review: apply SM-2 and reschedule the lesson. */
export async function POST(request: Request, ctx: RouteContext<"/api/reviews/[id]">) {
  const { id } = await ctx.params;
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
  return NextResponse.json({ next });
}
