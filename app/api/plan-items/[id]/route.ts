import { NextResponse } from "next/server";
import { updatePlanItem, userOwnsPlanItem } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["todo", "doing", "done"]);

export async function PATCH(request: Request, ctx: RouteContext<"/api/plan-items/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPlanItem(user.id, Number(id))) return forbidden();
  const body = await request.json().catch(() => ({}));
  const status = body.status;
  if (!VALID.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  updatePlanItem(Number(id), status);
  return NextResponse.json({ ok: true });
}
