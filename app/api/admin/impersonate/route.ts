import { NextResponse } from "next/server";
import { getUser } from "@/lib/repo";
import {
  getAuthState,
  startImpersonation,
  stopImpersonation,
  unauthorized,
  forbidden,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only: start acting as another user. Body: { userId }. */
export async function POST(request: Request) {
  const { real } = await getAuthState();
  if (!real) return unauthorized();
  if (!real.is_owner) return forbidden();

  const body = await request.json().catch(() => ({}));
  const userId = Number(body.userId);
  if (!userId || userId === real.id) return NextResponse.json({ error: "Pick another user" }, { status: 400 });
  const target = getUser(userId);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await startImpersonation(userId);
  return NextResponse.json({ ok: true, actingAs: { id: target.id, email: target.email } });
}

/** Stop acting as another user (owner or not — always safe to clear). */
export async function DELETE() {
  const { real } = await getAuthState();
  if (!real) return unauthorized();
  await stopImpersonation();
  return NextResponse.json({ ok: true });
}
