import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth";
import { publicUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { real, effective, impersonating } = await getAuthState();
  return NextResponse.json({
    user: effective ? publicUser(effective) : null,
    impersonating,
    realEmail: real?.email ?? null,
    realIsOwner: !!real?.is_owner,
  });
}
