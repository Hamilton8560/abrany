import { NextResponse } from "next/server";
import { isFreeAiEnabled, setFreeAiEnabled } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current free-access state (any signed-in user may read it). */
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return NextResponse.json({ enabled: isFreeAiEnabled() });
}

/** Owner-only: open or close the built-in AI to everyone. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.is_owner) return forbidden();

  const body = await request.json().catch(() => ({}));
  setFreeAiEnabled(!!body.enabled);
  return NextResponse.json({ enabled: isFreeAiEnabled() });
}
