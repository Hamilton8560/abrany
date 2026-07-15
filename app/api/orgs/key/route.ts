import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { orgForUser, rotateOrgKey } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rotate the partner API key (invalidates the old one everywhere). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const org = rotateOrgKey(m.org.id);
  return NextResponse.json({ apiKey: org?.api_key ?? "" });
}
