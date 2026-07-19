"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtWhen } from "@/lib/client";
import type { Presentation } from "@/lib/repo";
import { ArrowRight, PlusIcon, SlidesIcon } from "@/components/icons";
import DraftAssistant from "@/components/app/DraftAssistant";

export default function PresentationsPage() {
  const [decks, setDecks] = useState<Presentation[]>([]);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ presentations: Presentation[] }>("/api/presentations");
    setDecks(d.presentations);
    return d.presentations;
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // poll while any deck is still generating
  useEffect(() => {
    const pending = decks.some((d) => d.status === "generating");
    if (pending && !pollRef.current) {
      pollRef.current = setInterval(() => load().catch(() => {}), 2500);
    } else if (!pending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !pending) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [decks, load]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/presentations", { method: "POST", body: JSON.stringify({ topic }) });
      setTopic("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the deck");
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
            PRESENTATIONS
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
          Decks on demand
        </h1>
        <p className="mt-2 max-w-[480px] text-[14px] text-muted">
          Your coach builds a full slide deck on any topic — with diagrams — ready to present or export.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <DraftAssistant
          surfaceId="presentation"
          seed={topic}
          onApply={(v) => setTopic(v.topic ?? topic)}
          triggerLabel="Not sure what to say? Draft with AI"
        />
      <form onSubmit={create} className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] p-5 sm:flex-row">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. How spaced repetition works, for a study group"
          className="flex-1 rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
        />
        <button
          type="submit"
          disabled={creating || !topic.trim()}
          className="glassx-dark flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <PlusIcon className="size-3.5" /> {creating ? "Starting…" : "Build deck"}
        </button>
      </form>
      </div>
      {error && <p className="-mt-4 text-[12px] text-accent">{error}</p>}

      <section className="flex flex-col gap-3">
        {decks.length === 0 && (
          <p className="text-[14px] text-muted">No decks yet — build one above.</p>
        )}
        {decks.map((d) => (
          <DeckRow key={d.id} deck={d} onDeleted={load} />
        ))}
      </section>
    </div>
  );
}

function DeckRow({ deck, onDeleted }: { deck: Presentation; onDeleted: () => void }) {
  const generating = deck.status === "generating";
  const errored = deck.status === "error";

  const inner = (
    <>
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-[13px] ${
          errored ? "bg-accent/12 text-accent" : "bg-accent/12 text-accent"
        }`}
      >
        <SlidesIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{deck.title}</p>
        <p className="truncate text-[12.5px] text-muted">
          {generating ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-accent" /> Building your deck…
            </span>
          ) : errored ? (
            <span className="text-accent">Failed — {deck.error || "try again"}</span>
          ) : (
            `${fmtWhen(deck.created_at)}`
          )}
        </p>
      </div>
      {!generating && !errored && <ArrowRight className="size-4 shrink-0 text-muted" />}
    </>
  );

  if (generating || errored) {
    return <div className="glass flex items-center gap-4 rounded-[var(--radius-card)] p-4">{inner}</div>;
  }
  return (
    <Link
      href={`/app/presentations/${deck.id}`}
      className="glass group flex items-center gap-4 rounded-[var(--radius-card)] p-4 transition-transform hover:-translate-y-0.5"
    >
      {inner}
    </Link>
  );
}
