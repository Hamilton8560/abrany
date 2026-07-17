import { NextResponse } from "next/server";
import { setUserPassword, setMustResetPassword } from "@/lib/repo";
import { hashPassword } from "@/lib/password";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set a new password (clears the must-reset flag issued with a temporary password). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const newPassword = (body.newPassword ?? "").toString();
  if (newPassword.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  setUserPassword(user.id, hashPassword(newPassword));
  setMustResetPassword(user.id, false);
  return NextResponse.json({ ok: true });
}
