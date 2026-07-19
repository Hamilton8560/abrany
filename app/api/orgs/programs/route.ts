import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser } from "@/lib/org";
import { llmContext, withLlm } from "@/lib/minimax";
import { createProgram, listPrograms } from "@/lib/programs";
import { generateProgramOutline } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  return { user, org: m.org };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ programs: listPrograms(ctx.org.id) });
}

/** Author a reusable program from a (co-piloted) title + description. */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  const description = (body.description ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "A program title is required" }, { status: 400 });

  const llm = llmContext(ctx.user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  try {
    const curriculum = await withLlm(
      llm.creds,
      () => generateProgramOutline({ title, description }),
      ctx.user.language,
    );
    createProgram(ctx.org.id, curriculum, ctx.user.language || "en", ctx.user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the program" },
      { status: 502 },
    );
  }
  return NextResponse.json({ programs: listPrograms(ctx.org.id) }, { status: 201 });
}
