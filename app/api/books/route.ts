import { NextResponse } from "next/server";
import { listBooks, createBook, createChapterStubs, setBookStatus } from "@/lib/repo";
import { generateBookOutline } from "@/lib/coach";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json({ books: listBooks(user.id) });
}

/** Create a book: generate the outline (chapters) now; chapters generate async later. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const brief = (body.brief ?? "").toString().trim();
  if (!brief) return NextResponse.json({ error: "A brief is required" }, { status: 400 });
  try {
    const outline = await withLlm(llm.creds, () => generateBookOutline({ brief }), user.language);
    const book = createBook(user.id, outline.title, brief);
    createChapterStubs(book.id, outline.chapters);
    setBookStatus(book.id, "ready");
    return NextResponse.json({ book }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not outline the book";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
