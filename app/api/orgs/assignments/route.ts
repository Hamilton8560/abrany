import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, listAssignments } from "@/lib/org";
import { buildAssignment, progressJson } from "@/lib/orgApi";

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
  return NextResponse.json({ assignments: listAssignments(ctx.org.id).map(progressJson) });
}

/** Assign education (optionally a full curriculum) to an employee, with a deadline. */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const result = buildAssignment(ctx.org, body, ctx.user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(
    { assignments: listAssignments(ctx.org.id).map(progressJson) },
    { status: 201 },
  );
}
