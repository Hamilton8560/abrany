import { NextResponse } from "next/server";
import { dueLessons, srsSummary } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ due: dueLessons(), summary: srsSummary() });
}
