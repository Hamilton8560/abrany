import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser } from "@/lib/org";
import { deployProgram } from "@/lib/programs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deploy a program to a set of employees (each gets their own goal copy). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const userIds = Array.isArray(body.userIds)
    ? body.userIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
    : [];
  if (!userIds.length) return NextResponse.json({ error: "Pick at least one employee" }, { status: 400 });

  const result = deployProgram({
    orgId: m.org.id,
    programId: Number(id),
    userIds,
    dueAt: body.dueAt || null,
    note: (body.note ?? "").toString(),
    assignedBy: user.id,
  });
  return NextResponse.json(result, { status: 201 });
}
