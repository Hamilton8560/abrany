import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import {
  deleteManual,
  getManual,
  manualContent,
  manualImages,
  manualProgress,
  manualRequest,
  setManualProgress,
  troubleshootMermaid,
  figureSteps,
  userOwnsManual,
} from "@/lib/workshop";
import { deleteManualImages, imageKeyFor } from "@/lib/imageGen";
import { enqueueManual, enqueueManualImages } from "@/lib/worker";
import { llmContext } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function owned(ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() } as const;
  const id = Number((await ctx.params).id);
  if (!userOwnsManual(user.id, id)) return { error: forbidden() } as const;
  return { user, id } as const;
}

export async function GET(_req: Request, ctx: Ctx) {
  const o = await owned(ctx);
  if ("error" in o) return o.error;
  const row = getManual(o.id)!;
  const content = manualContent(row);
  const canIllustrate = !!imageKeyFor(o.user);
  const images = manualImages(row);
  // self-heal: pictures still missing (e.g. a restart broke the job chain) → queue them
  // again. Idempotent — an active image job for this manual is simply returned.
  if (row.status === "ready" && content && canIllustrate && figureSteps(content).some((s) => images[s.key] !== "ready" && images[s.key] !== "error"))
    enqueueManualImages(o.id, o.user.id);
  return NextResponse.json({
    manual: {
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      error: row.error,
      request: manualRequest(row),
      content,
      flowchart: content ? troubleshootMermaid(content) : "",
      images,
      progress: manualProgress(row),
      canIllustrate,
      created_at: row.created_at,
    },
  });
}

/** { progress: stepKey[] } saves ticked steps · { regenerate: true } rewrites the manual. */
export async function PATCH(request: Request, ctx: Ctx) {
  const o = await owned(ctx);
  if ("error" in o) return o.error;
  const body = await request.json().catch(() => ({}));
  if (Array.isArray(body.progress)) setManualProgress(o.id, body.progress.map(String));
  if (body.regenerate === true) {
    const llm = llmContext(o.user);
    if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
    enqueueManual(o.id, o.user.id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const o = await owned(ctx);
  if ("error" in o) return o.error;
  deleteManual(o.id);
  deleteManualImages(o.id);
  return NextResponse.json({ ok: true });
}
