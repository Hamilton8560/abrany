import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, deleteAssignment, getAssignment, updateAssignment, normalizeDueAt } from "@/lib/org";
import { assignmentDetailJson } from "@/lib/orgApi";

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
  const detail = assignmentDetailJson(ctx.org, Number(id));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ assignment: detail });
}

/** Edit an assignment: { dueAt?: ISO date | null, note?: string }. Pushing a deadline un-fails it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const a = getAssignment(Number(id));
  if (!a || a.org_id !== ctx.org.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const fields: { dueAt?: string | null; note?: string } = {};
  if ("dueAt" in body) {
    const due = normalizeDueAt(body.dueAt);
    if (due === undefined) return NextResponse.json({ error: "dueAt must be an ISO date (e.g. 2026-08-01)" }, { status: 400 });
    fields.dueAt = due;
  }
  if (typeof body.note === "string") fields.note = body.note.trim();
  updateAssignment(ctx.org.id, a.id, fields);
  return NextResponse.json({ assignment: assignmentDetailJson(ctx.org, a.id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  deleteAssignment(ctx.org.id, Number(id));
  return NextResponse.json({ ok: true });
}
