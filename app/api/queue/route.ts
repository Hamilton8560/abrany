import { NextResponse } from "next/server";
import { queueState } from "@/lib/queue";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return NextResponse.json(queueState());
}
