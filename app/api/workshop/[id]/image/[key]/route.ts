import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { getManual, manualContent, figureSteps, userOwnsManual } from "@/lib/workshop";
import { imageKeyFor, readManualImage } from "@/lib/imageGen";
import { enqueueManualImages } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; key: string }> };

/** The step's illustration (JPEG). */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, key } = await ctx.params;
  if (!userOwnsManual(user.id, Number(id))) return forbidden();
  const jpeg = readManualImage(Number(id), key);
  if (!jpeg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
  });
}

/** Redraw this step's illustration. */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, key } = await ctx.params;
  const manualId = Number(id);
  if (!userOwnsManual(user.id, manualId)) return forbidden();
  if (!imageKeyFor(user)) return NextResponse.json({ error: "Illustrations need the built-in AI or your own MiniMax key" }, { status: 400 });
  const manual = manualContent(getManual(manualId)!);
  if (!manual || !figureSteps(manual).some((s) => s.key === key))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  enqueueManualImages(manualId, user.id, key);
  return NextResponse.json({ ok: true });
}
