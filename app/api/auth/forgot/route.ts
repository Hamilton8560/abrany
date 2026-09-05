import { NextResponse } from "next/server";
import { getUserByEmail, displayName } from "@/lib/repo";
import { createResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/urls";
import { ensureOwner } from "@/lib/auth";
import { orgForUser } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public "Forgot password?": emails a single-use reset link if the address has an
 * account. Always answers 200 with the same body, so it can't be used to check
 * whether an email is registered.
 */
export async function POST(request: Request) {
  ensureOwner();
  const body = await request.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const user = getUserByEmail(email);
  if (user) {
    const { token, id } = createResetToken(user.id);
    const org = orgForUser(user.id)?.org;
    await sendPasswordResetEmail({
      to: user.email,
      name: displayName(user),
      orgName: org?.name ?? "",
      resetUrl: `${appBaseUrl()}/reset?token=${encodeURIComponent(token)}`,
      tokenId: id,
    });
  }
  return NextResponse.json({ ok: true, message: "If that email has an account, a reset link is on its way." });
}
