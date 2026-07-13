import { NextResponse } from "next/server";
import { setUserName } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set the current user's display name (used on certificates). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  setUserName(user.id, (body.name ?? "").toString());
  return NextResponse.json({ ok: true });
}
