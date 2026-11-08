import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, removeMember, listMembers, setMemberLanguage } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  removeMember(m.org.id, Number(id));
  return NextResponse.json({ members: listMembers(m.org.id) });
}

/** Org admin sets an employee's language. Body: { language: code }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const ok = setMemberLanguage(m.org.id, Number(id), (body.language ?? "").toString());
  if (!ok) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  return NextResponse.json({ members: listMembers(m.org.id) });
}
