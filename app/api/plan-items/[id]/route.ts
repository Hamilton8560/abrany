import { NextResponse } from "next/server";
import { updatePlanItem } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["todo", "doing", "done"]);

export async function PATCH(request: Request, ctx: RouteContext<"/api/plan-items/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const status = body.status;
  if (!VALID.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  updatePlanItem(Number(id), status);
  return NextResponse.json({ ok: true });
}
