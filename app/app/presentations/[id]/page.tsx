"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { Presentation } from "@/lib/repo";
import SlideDeck from "@/components/app/SlideDeck";
import QueueHint from "@/components/app/QueueHint";

export default function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deck, setDeck] = useState<Presentation | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ presentation: Presentation }>(`/api/presentations/${id}`);
    setDeck(d.presentation);
    setLoading(false);
    return d.presentation;
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const generating = deck?.status === "generating";
    if (generating && !pollRef.current) {
      pollRef.current = setInterval(() => load().catch(() => {}), 2500);
    } else if (!generating && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !generating) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [deck, load]);

  const remove = async () => {
    await api(`/api/presentations/${id}`, { method: "DELETE" });
    router.push("/app/presentations");
  };

  if (loading) return <p className="text-[14px] text-muted">Loading…</p>;
  if (!deck) return <p className="text-[14px] text-muted">Deck not found.</p>;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Link href="/app/presentations" className="hover:text-ink">
            Presentations
          </Link>
          <span>/</span>
          <span className="text-ink">{deck.title}</span>
        </div>
        <button
          onClick={remove}
          className="text-[12.5px] font-semibold text-muted hover:text-accent"
        >
          Delete
        </button>
      </div>

      {deck.status === "generating" && (
        <div className="glass flex flex-col items-center gap-3 rounded-[var(--radius-card-lg)] px-6 py-16 text-center">
          <span className="size-3 animate-pulse rounded-full bg-accent" />
          <p className="text-[15px] font-semibold text-ink">Building your deck…</p>
          <div className="max-w-[400px]">
            <QueueHint background />
          </div>
        </div>
      )}

      {deck.status === "error" && (
        <div className="glass rounded-[var(--radius-card-lg)] p-6 text-center">
          <p className="text-[14px] text-accent">Couldn&apos;t build this deck: {deck.error}</p>
        </div>
      )}

      {deck.status === "ready" && <SlideDeck content={deck.content} />}
    </div>
  );
}
