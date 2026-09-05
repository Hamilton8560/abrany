import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, memberRole } from "@/lib/org";
import { getUser, displayName } from "@/lib/repo";
import { createResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin rescue: email a member a fresh single-use password reset link. Works for
 * anyone stuck — never got the welcome email, lost the temp password, forgot
 * theirs. Each issuance has its own idempotency key, so a re-send always delivers
 * (the original welcome email could only ever be sent once per address).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const targetId = Number(id);
  if (!memberRole(m.org.id, targetId))
    return NextResponse.json({ error: "That person is not a member of your organization" }, { status: 404 });
  const target = getUser(targetId);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { token, id: tokenId } = createResetToken(target.id);
  await sendPasswordResetEmail({
    to: target.email,
    name: displayName(target),
    orgName: m.org.name,
    resetUrl: `${appBaseUrl()}/reset?token=${encodeURIComponent(token)}`,
    tokenId,
  });
  // the raw token is never returned — email is the only channel
  return NextResponse.json({ ok: true, sentTo: target.email });
}
