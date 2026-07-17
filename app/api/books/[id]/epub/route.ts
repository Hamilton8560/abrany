import { NextResponse } from "next/server";
import { getBook, listChapters, userOwnsBook, displayName } from "@/lib/repo";
import { buildEpub } from "@/lib/epub";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the book as an EPUB (works with Kindle via Send-to-Kindle). */
export async function GET(_req: Request, ctx: RouteContext<"/api/books/[id]/epub">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!userOwnsBook(user.id, Number(id))) return forbidden();
  const book = getBook(Number(id));
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ready = listChapters(book.id).filter((c) => c.status === "ready" && c.content.trim());
  if (!ready.length) {
    return NextResponse.json({ error: "Write at least one chapter before downloading." }, { status: 400 });
  }

  const epub = await buildEpub({
    title: book.title,
    author: displayName(user),
    language: user.language || "en",
    chapters: ready.map((c) => ({ title: c.title, markdown: c.content })),
  });

  const filename = `${book.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "book"}.epub`;
  return new Response(new Uint8Array(epub), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
