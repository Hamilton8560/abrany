import { NextResponse } from "next/server";
import { getBook, listChapters, deleteBook, userOwnsBook } from "@/lib/repo";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsBook(user.id, Number(id))) return forbidden();
  const book = getBook(Number(id))!;
  return NextResponse.json({ book, chapters: listChapters(book.id) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsBook(user.id, Number(id))) return forbidden();
  deleteBook(Number(id));
  return NextResponse.json({ ok: true });
}
