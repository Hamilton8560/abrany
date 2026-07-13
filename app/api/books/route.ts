import { NextResponse } from "next/server";
import { listBooks, createBook, createChapterStubs, setBookStatus } from "@/lib/repo";
import { generateBookOutline } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ books: listBooks() });
}

/** Create a book: generate the outline (chapters) now; chapters generate async later. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const brief = (body.brief ?? "").toString().trim();
  if (!brief) return NextResponse.json({ error: "A brief is required" }, { status: 400 });
  try {
    const outline = await generateBookOutline({ brief });
    const book = createBook(outline.title, brief);
    createChapterStubs(book.id, outline.chapters);
    setBookStatus(book.id, "ready");
    return NextResponse.json({ book }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not outline the book";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
