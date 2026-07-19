import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser } from "@/lib/org";
import { deleteProgram, listPrograms, getProgramFull } from "@/lib/programs";

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const program = getProgramFull(Number(id));
  if (!program || program.org_id !== ctx.org.id)
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  return NextResponse.json({ program });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  deleteProgram(ctx.org.id, Number(id));
  return NextResponse.json({ programs: listPrograms(ctx.org.id) });
}
