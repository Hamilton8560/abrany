import { NextResponse } from "next/server";
import { listUsers } from "@/lib/repo";
import { getAuthState, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only: list every account (for the instructor / act-as picker). */
export async function GET() {
  const { real } = await getAuthState();
  if (!real) return unauthorized();
  if (!real.is_owner) return forbidden();
  return NextResponse.json({ users: listUsers() });
}
