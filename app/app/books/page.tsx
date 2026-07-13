"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtWhen } from "@/lib/client";
import type { Book } from "@/lib/repo";
import { ArrowRight, PlusIcon, BookIcon } from "@/components/icons";

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

      <section className="flex flex-col gap-3">
        {books.length === 0 && <p className="text-[14px] text-muted">No books yet — start one above.</p>}
        {books.map((b) => (
          <Link
            key={b.id}
            href={`/app/books/${b.id}`}
            className="glass group flex items-center gap-4 rounded-[var(--radius-card)] p-4 transition-transform hover:-translate-y-0.5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-accent/12 text-accent">
              <BookIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{b.title}</p>
              <p className="truncate text-[12.5px] text-muted">{fmtWhen(b.created_at)}</p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </section>
    </div>
  );
}
