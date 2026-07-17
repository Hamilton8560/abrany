import { NextResponse } from "next/server";
import { updateGoal, issueCertificate, getCertificateForGoal, examsForGoal, finalPassed, userOwnsGoal } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { sendCertificateEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirm a goal is finished, mark it done, and issue its credential.
 * Requires an explicit { confirm: true } so a goal is never "completed" by an
 * accidental toggle. Idempotent — re-completing returns the existing credential.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/goals/[id]/complete">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const goalId = Number(id);
  if (!userOwnsGoal(user.id, goalId)) return forbidden();

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
  }

  // The certificate is earned by passing the final exam, not by clicking a button.
  const hasFinal = examsForGoal(goalId).some((e) => e.kind === "final");
  if (hasFinal && !finalPassed(goalId)) {
    return NextResponse.json(
      { error: "Pass the final exam to earn your certificate.", needsFinal: true },
      { status: 403 },
    );
  }

  updateGoal(goalId, { status: "done" });
  const wasIssued = !!getCertificateForGoal(user.id, goalId);
  const certificate = issueCertificate(user.id, goalId);
  // idempotent endpoint — only email on the FIRST issuance, not every re-completion call
  if (!wasIssued && user.notify_certificates) {
    await sendCertificateEmail({
      to: user.email,
      name: certificate.recipient_name,
      title: certificate.title,
      overall: certificate.overall,
      certId: certificate.id,
      verifyUrl: `${appBaseUrl()}/verify/${certificate.id}`,
    });
  }
  return NextResponse.json({ certificate });
}

/** Current credential for this goal, if one has been issued. */
export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/complete">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const goalId = Number(id);
  if (!userOwnsGoal(user.id, goalId)) return forbidden();
  return NextResponse.json({ certificate: getCertificateForGoal(user.id, goalId) ?? null });
}
