"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtWhen } from "@/lib/client";
import type { Book } from "@/lib/repo";
import { PlusIcon } from "@/components/icons";
import BookCover from "@/components/app/BookCover";
import DraftAssistant from "@/components/app/DraftAssistant";

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<{ books: Book[] }>("/api/books").then((d) => setBooks(d.books));

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/books", { method: "POST", body: JSON.stringify({ brief }) });
      setBrief("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the book");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-8">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            BOOKS
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
          Write the whole book
        </h1>
        <p className="mt-2 max-w-[520px] text-[14px] text-muted">
          Describe a book and your coach outlines it, then writes it chapter by chapter — each one
          generated on its own so it stays coherent and never runs out of room.
        </p>
      </header>

      <div className="flex justify-end">
        <DraftAssistant
          surfaceId="book"
          seed={brief}
          onApply={(v) => setBrief(v.brief ?? brief)}
          triggerLabel="Not sure where to start? Draft with AI"
          className="w-full"
        />
      </div>
      <form onSubmit={create} className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] p-5">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder="e.g. A beginner's guide to building strong daily focus habits, practical and encouraging"
          className="w-full resize-none rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
        />
        {error && <p className="text-[12px] text-accent">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {creating && <span className="text-[12px] text-muted">Outlining the book…</span>}
          <button
            type="submit"
            disabled={creating || !brief.trim()}
            className="glassx-dark flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            <PlusIcon className="size-3.5" /> {creating ? "Outlining…" : "Start book"}
          </button>
        </div>
      </form>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {books.length === 0 && (
          <p className="col-span-full text-[14px] text-muted">No books yet — start one above.</p>
        )}
        {books.map((b) => (
          <Link
            key={b.id}
            href={`/app/books/${b.id}`}
            className="group flex flex-col gap-2.5 transition-transform hover:-translate-y-1"
          >
            <BookCover title={b.title} author="Abrany" />
            <div className="min-w-0 px-0.5">
              <p className="truncate text-[13.5px] font-semibold text-ink">{b.title}</p>
              <p className="truncate text-[11.5px] text-muted">{fmtWhen(b.created_at)}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
