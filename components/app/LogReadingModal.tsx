"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Book } from "@/lib/repo";

const EXTERNAL = "__external__";

/**
 * Log time spent reading — an in-app book or an external/physical one.
 * Reading time is recorded as a `mode='reading'` session, which credits the
 * Temporal lobe (Comprehension) in Your Mind.
 */
export default function LogReadingModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [books, setBooks] = useState<Book[]>([]);
  const [source, setSource] = useState<string>(EXTERNAL); // book id as string, or EXTERNAL
  const [externalTitle, setExternalTitle] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ books: Book[] }>("/api/books")
      .then((d) => {
        setBooks(d.books);
        // default to the most recent in-app book if the user has any
        if (d.books.length) setSource(String(d.books[0].id));
      })
      .catch(() => {});
  }, []);

  const isExternal = source === EXTERNAL;

  const save = async () => {
    if (isExternal && !externalTitle.trim()) {
      setError("Give the book a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          mode: "reading",
          durationSec: Math.max(1, minutes) * 60,
          bookId: isExternal ? null : Number(source),
          tags: isExternal ? externalTitle.trim() : "",
          notes,
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-[440px] rounded-[var(--radius-card-lg)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[22px] font-extrabold uppercase text-ink">Log reading</h3>
        <p className="mt-1 text-[13px] text-muted">
          Time spent reading builds Comprehension (Temporal lobe) in Your Mind.
        </p>

        <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
          Book
        </label>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent/50"
        >
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
          <option value={EXTERNAL}>External / physical book…</option>
        </select>

        {isExternal && (
          <input
            autoFocus
            value={externalTitle}
            onChange={(e) => setExternalTitle(e.target.value)}
            placeholder="e.g. Deep Work — Cal Newport"
            className="mt-3 w-full rounded-[14px] border border-line bg-white/70 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
          />
        )}

        <div className="mt-4 flex gap-3">
          <div className="w-[120px]">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Minutes
            </label>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
              className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent/50"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Notes (optional)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="pages, chapter, a thought…"
              className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-accent">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Log reading"}
          </button>
        </div>
      </div>
    </div>
  );
}
