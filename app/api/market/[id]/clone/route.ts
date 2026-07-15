import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { cloneCourse } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a published course to my goals (deep copy, progress reset). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const result = cloneCourse(Number(id), user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
