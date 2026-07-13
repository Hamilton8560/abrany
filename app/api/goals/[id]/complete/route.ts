import { NextResponse } from "next/server";
import { updateGoal, issueCertificate, getCertificateForGoal, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirm a goal is finished, mark it done, and issue its credential.
 * Requires an explicit { confirm: true } so a goal is never "completed" by an
 * accidental toggle. Idempotent — re-completing returns the existing credential.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/goals/[id]/complete">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const goalId = Number(id);
  if (!userOwnsGoal(user.id, goalId)) return forbidden();

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
  }

  updateGoal(goalId, { status: "done" });
  const certificate = issueCertificate(user.id, goalId);
  return NextResponse.json({ certificate });
}

/** Current credential for this goal, if one has been issued. */
export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/complete">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const goalId = Number(id);
  if (!userOwnsGoal(user.id, goalId)) return forbidden();
  return NextResponse.json({ certificate: getCertificateForGoal(user.id, goalId) ?? null });
}
