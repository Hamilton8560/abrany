import { NextResponse } from "next/server";
import { dueLessons, srsSummary, upcomingReviews, enrolledLessons } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    due: dueLessons(user.id),
    summary: srsSummary(user.id),
    upcoming: upcomingReviews(user.id),
    rotation: enrolledLessons(user.id),
  });
}
