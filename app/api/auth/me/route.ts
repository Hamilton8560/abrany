import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { publicUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
