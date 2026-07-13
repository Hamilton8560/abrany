import { NextResponse } from "next/server";
import { getBook, listChapters, deleteBook } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const { id } = await ctx.params;
  const book = getBook(Number(id));
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ book, chapters: listChapters(book.id) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const { id } = await ctx.params;
  deleteBook(Number(id));
  return NextResponse.json({ ok: true });
}
