import { NextResponse } from "next/server";
import { setUserPassword, setMustResetPassword, getUser } from "@/lib/repo";
import { hashPassword } from "@/lib/password";
import { consumeResetToken } from "@/lib/passwordReset";
import { startSession } from "@/lib/auth";
import { publicUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: set a new password with a single-use reset link, then sign in. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = (body.token ?? "").toString();
  const newPassword = (body.newPassword ?? "").toString();
  if (newPassword.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  const userId = consumeResetToken(token);
  if (!userId)
    return NextResponse.json(
      { error: "This link is invalid or has expired — request a new one." },
      { status: 400 },
    );
  setUserPassword(userId, hashPassword(newPassword));
  setMustResetPassword(userId, false);
  await startSession(userId);
  const user = getUser(userId)!;
  return NextResponse.json({ ok: true, user: publicUser(user) });
}
