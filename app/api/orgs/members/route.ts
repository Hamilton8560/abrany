import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, addMemberByEmail, listMembers, listInvites } from "@/lib/org";

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
  return NextResponse.json({ members: listMembers(ctx.org.id), invites: listInvites(ctx.org.id) });
}

/** Sign an employee up: existing accounts join now; new emails get a real account + a temp-password email. */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const role = body.role === "admin" ? "admin" : "member";
  const result = await addMemberByEmail(ctx.org.id, email, role);
  return NextResponse.json({
    status: result.status, // never leak tempPassword to the admin — it's emailed to the employee only
    members: listMembers(ctx.org.id),
    invites: listInvites(ctx.org.id),
  });
}
