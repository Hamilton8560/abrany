import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { unpublishCourse } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unpublish your listing (the course itself stays yours). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  unpublishCourse(user.id, Number(id));
  return NextResponse.json({ ok: true });
}
