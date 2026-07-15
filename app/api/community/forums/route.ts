import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { listForums } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ forums: listForums() });
}
