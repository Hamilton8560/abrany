import { NextResponse } from "next/server";
import {
  updatePlanItem,
  updatePlanItemFields,
  deletePlanItem,
  movePlanItem,
  userOwnsPlanItem,
} from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["todo", "doing", "done"]);

/**
 * Update a milestone: { status } as before, and/or course-editing fields
 * { title, detail, estimate } and { move: "up" | "down" } to reorder.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/plan-items/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPlanItem(user.id, Number(id))) return forbidden();
  const body = await request.json().catch(() => ({}));

  if (body.status !== undefined) {
    if (!VALID.has(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    updatePlanItem(Number(id), body.status);
  }
  if (typeof body.title === "string" || typeof body.detail === "string" || typeof body.estimate === "string") {
    updatePlanItemFields(Number(id), {
      title: typeof body.title === "string" ? body.title : undefined,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      estimate: typeof body.estimate === "string" ? body.estimate : undefined,
    });
  }
  if (body.move === "up" || body.move === "down") movePlanItem(Number(id), body.move);
  return NextResponse.json({ ok: true });
}

/** Remove a milestone and its sections from the course. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/plan-items/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPlanItem(user.id, Number(id))) return forbidden();
  deletePlanItem(Number(id));
  return NextResponse.json({ ok: true });
}
