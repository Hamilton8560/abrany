import { NextResponse } from "next/server";
import { getPresentation, deletePresentation } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/presentations/[id]">) {
  const { id } = await ctx.params;
  const presentation = getPresentation(Number(id));
  if (!presentation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ presentation });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/presentations/[id]">) {
  const { id } = await ctx.params;
  deletePresentation(Number(id));
  return NextResponse.json({ ok: true });
}
