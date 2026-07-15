import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, revokeInvite, listInvites } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  revokeInvite(m.org.id, Number(id));
  return NextResponse.json({ invites: listInvites(m.org.id) });
}
