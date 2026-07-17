import { NextResponse } from "next/server";
import { getStudyGuide, deleteStudyGuide, userOwnsStudyGuide } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!userOwnsStudyGuide(user.id, Number(id))) return forbidden();
  const guide = getStudyGuide(Number(id));
  if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ guide });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!userOwnsStudyGuide(user.id, Number(id))) return forbidden();
  deleteStudyGuide(Number(id));
  return NextResponse.json({ ok: true });
}
