import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { userOwnsGoal, getPlanForGoal, listGoals } from "@/lib/repo";
import { browseMarket, myListings, publishCourse } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browse the marketplace (?age=…&q=…) plus your own listings and publishable courses. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const listings = browseMarket({
    ageGroup: url.searchParams.get("age") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  // goals with a plan that aren't listed yet = candidates for publishing
  const mine = myListings(user.id);
  const listedGoalIds = new Set(mine.map((l) => l.goal_id));
  const publishable = listGoals(user.id)
    .filter((g) => !listedGoalIds.has(g.id) && !!getPlanForGoal(g.id)?.items.length)
    .map((g) => ({ id: g.id, title: g.title }));
  return NextResponse.json({ listings, mine, publishable });
}

/** Publish (or update) one of your courses. Body: { goalId, blurb?, tags?, ageGroup? }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const goalId = Number(body.goalId);
  if (!goalId || !userOwnsGoal(user.id, goalId)) return forbidden();
  const plan = getPlanForGoal(goalId);
  if (!plan || !plan.items.length)
    return NextResponse.json({ error: "Give this course a plan before publishing it" }, { status: 400 });
  const listing = publishCourse(user.id, goalId, {
    blurb: (body.blurb ?? "").toString(),
    tags: (body.tags ?? "").toString(),
    ageGroup: (body.ageGroup ?? "").toString(),
  });
  return NextResponse.json({ listing }, { status: 201 });
}
