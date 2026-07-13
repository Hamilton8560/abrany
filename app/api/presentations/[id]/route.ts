import { NextResponse } from "next/server";
import { getPresentation, deletePresentation, userOwnsPresentation } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/presentations/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPresentation(user.id, Number(id))) return forbidden();
  return NextResponse.json({ presentation: getPresentation(Number(id)) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/presentations/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsPresentation(user.id, Number(id))) return forbidden();
  deletePresentation(Number(id));
  return NextResponse.json({ ok: true });
}
