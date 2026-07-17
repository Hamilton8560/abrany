"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { Book, Chapter } from "@/lib/repo";
import Markdown from "@/components/app/Markdown";
import QueueHint from "@/components/app/QueueHint";
import BookCover from "@/components/app/BookCover";
import { ArrowRight, CheckIcon } from "@/components/icons";

type Resp = { book: Book; chapters: Chapter[] };

export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState<number | null>(null); // order_index being read
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const d = await api<Resp>(`/api/books/${id}`);
    setBook(d.book);
    setChapters(d.chapters);
    setLoading(false);
    return d.chapters;
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const pending = chapters.some((c) => c.status === "queued" || c.status === "generating");
    if (pending && !pollRef.current) pollRef.current = setInterval(() => load().catch(() => {}), 2500);
    else if (!pending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !pending) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [chapters, load]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const generate = async (c: Chapter) => {
    setChapters((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: "queued" } : x)));
    await api(`/api/chapters/${c.id}`, { method: "POST" }).catch(() => {});
    load().catch(() => {});
  };

  const prepareAll = async () => {
    setChapters((cs) =>
      cs.map((x) => (x.status === "stub" || x.status === "error" ? { ...x, status: "queued" } : x)),
    );
    await api(`/api/books/${id}/prepare`, { method: "POST" }).catch(() => {});
    load().catch(() => {});
  };

  const remove = async () => {
    await api(`/api/books/${id}`, { method: "DELETE" });
    router.push("/app/books");
  };

  if (loading) return <p className="text-[14px] text-muted">Loading…</p>;
  if (!book) return <p className="text-[14px] text-muted">Book not found.</p>;

  const readyCount = chapters.filter((c) => c.status === "ready").length;
  const current = reading != null ? chapters.find((c) => c.order_index === reading) : null;

  /* ───────── READER ───────── */
  if (current) {
    const prev = chapters.find((c) => c.order_index === current.order_index - 1);
    const next = chapters.find((c) => c.order_index === current.order_index + 1);
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <button
          onClick={() => setReading(null)}
          className="flex items-center gap-2 self-start text-[12.5px] font-medium text-muted hover:text-ink"
        >
          <ArrowRight className="size-3.5 rotate-180" /> Contents
        </button>

        <header className="text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[3px] text-accent">
            Chapter {current.order_index + 1}
          </p>
          <h1 className="mt-2 font-display text-[clamp(26px,4vw,38px)] font-extrabold uppercase leading-[1.05] text-ink">
            {current.title}
          </h1>
          <div className="mx-auto mt-4 flex items-center justify-center gap-2">
            <span className="h-px w-10 bg-line" />
            <span className="size-1.5 rotate-45 bg-accent/60" />
            <span className="h-px w-10 bg-line" />
          </div>
        </header>

        <article className="glass rounded-[var(--radius-card-lg)] p-6 sm:p-10 [&_h2]:mt-7 [&_h2]:font-display [&_h2]:text-[21px] [&_p]:text-[16px] [&_p]:leading-[1.75] [&_li]:text-[16px] [&_li]:leading-[1.65] [&>p:first-of-type]:first-letter:float-left [&>p:first-of-type]:first-letter:mr-2 [&>p:first-of-type]:first-letter:font-display [&>p:first-of-type]:first-letter:text-[52px] [&>p:first-of-type]:first-letter:font-extrabold [&>p:first-of-type]:first-letter:leading-[0.85] [&>p:first-of-type]:first-letter:text-accent [&>*>p:first-of-type]:first-letter:float-left [&>*>p:first-of-type]:first-letter:mr-2 [&>*>p:first-of-type]:first-letter:font-display [&>*>p:first-of-type]:first-letter:text-[52px] [&>*>p:first-of-type]:first-letter:font-extrabold [&>*>p:first-of-type]:first-letter:leading-[0.85] [&>*>p:first-of-type]:first-letter:text-accent">
          {current.status === "ready" ? (
            <Markdown>{current.content}</Markdown>
          ) : current.status === "queued" || current.status === "generating" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-[14px] text-muted">Writing this chapter…</p>
              <div className="max-w-[400px]">
                <QueueHint background />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-[14px] text-muted">This chapter hasn&apos;t been written yet.</p>
              <button
                onClick={() => generate(current)}
                className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              >
                Write it
              </button>
            </div>
          )}
        </article>

        <div className="flex items-center justify-between">
          <button
            onClick={() => prev && setReading(prev.order_index)}
            disabled={!prev}
            className="glassx flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink disabled:opacity-40"
          >
            <ArrowRight className="size-3.5 rotate-180" /> Previous
          </button>
          <button
            onClick={() => next && setReading(next.order_index)}
            disabled={!next}
            className="glassx-dark flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            Next <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  /* ───────── TABLE OF CONTENTS ───────── */
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-7">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <Link href="/app/books" className="hover:text-ink">
          Books
        </Link>
        <span>/</span>
        <span className="truncate text-ink">{book.title}</span>
      </div>

      <header className="glass flex flex-col gap-6 rounded-[var(--radius-card-lg)] p-6 sm:flex-row">
        <div className="w-[150px] shrink-0 self-center sm:w-[168px] sm:self-start">
          <BookCover title={book.title} author="Abrany" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[clamp(26px,4vw,38px)] font-extrabold uppercase leading-[1.02] text-ink">
            {book.title}
          </h1>
          {book.brief && <p className="mt-2 text-[14px] text-muted">{book.brief}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[12.5px] text-muted">
              {chapters.length} chapters · {readyCount} written
            </span>
            {chapters.some((c) => c.status === "stub" || c.status === "error") && (
              <button
                onClick={prepareAll}
                className="glassx-dark rounded-full px-4 py-2 text-[12.5px] font-semibold text-white"
              >
                Write all chapters
              </button>
            )}
            {readyCount > 0 && (
              <a
                href={`/api/books/${book.id}/epub`}
                download
                className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink"
              >
                ⬇ EPUB
              </a>
            )}
            <button onClick={remove} className="text-[12.5px] font-semibold text-muted hover:text-accent">
              Delete
            </button>
          </div>
          {readyCount > 0 && (
            <p className="mt-2 text-[11.5px] text-muted">
              EPUB works on Kindle (Send-to-Kindle), Apple Books, Kobo, and most readers.
            </p>
          )}
        </div>
      </header>

      <ol className="flex flex-col gap-2.5">
        {chapters.map((c) => {
          const ready = c.status === "ready";
          const busy = c.status === "queued" || c.status === "generating";
          return (
            <li
              key={c.id}
              className="glass flex items-center gap-4 rounded-[var(--radius-card)] p-4"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                  ready ? "bg-up/15 text-up" : "bg-accent/12 text-accent"
                }`}
              >
                {ready ? <CheckIcon className="size-4" /> : c.order_index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-ink">{c.title}</p>
                {c.summary && <p className="truncate text-[12.5px] text-muted">{c.summary}</p>}
              </div>
              {ready ? (
                <button
                  onClick={() => setReading(c.order_index)}
                  className="glassx-dark shrink-0 rounded-full px-4 py-1.5 text-[12px] font-semibold text-white"
                >
                  Read
                </button>
              ) : busy ? (
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted">
                  <span className="size-2 animate-pulse rounded-full bg-accent" />
                  {c.status === "queued" ? "Queued" : "Writing…"}
                </span>
              ) : c.status === "error" ? (
                <button onClick={() => generate(c)} className="shrink-0 text-[12px] font-semibold text-accent">
                  Retry
                </button>
              ) : (
                <button
                  onClick={() => generate(c)}
                  className="glassx shrink-0 rounded-full px-4 py-1.5 text-[12px] font-semibold text-ink"
                >
                  Write
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
