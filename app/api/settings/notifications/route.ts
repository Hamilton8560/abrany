import { NextResponse } from "next/server";
import { setNotificationPrefs, getUser } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { publicUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toggle which emails you get: { certificates?: boolean, weeklyReport?: boolean }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  setNotificationPrefs(user.id, {
    certificates: typeof body.certificates === "boolean" ? body.certificates : undefined,
    weeklyReport: typeof body.weeklyReport === "boolean" ? body.weeklyReport : undefined,
  });
  return NextResponse.json({ user: publicUser(getUser(user.id)!) });
}
