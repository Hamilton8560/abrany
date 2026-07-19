"use client";

import { useState } from "react";
import { ArrowRight } from "@/components/icons";

/**
 * Soft, dismissible prompt encouraging the reader to run a focus block while
 * they read. Purely presentational — it owns no timer state. Wire `onStart` to
 * the focus timer's start() (optionally attaching the book/chapter) once that
 * API exists:
 *
 *   <ReadingNudge
 *     bookTitle={book.title}
 *     onStart={() => timer.start({ bookId: book.id, chapterId })}
 *   />
 *
 * Render it only when NO block is running (the parent decides that from timer
 * state) so it never nags mid-session.
 */
export default function ReadingNudge({
  bookTitle,
  onStart,
}: {
  bookTitle?: string;
  onStart: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="glass flex items-center gap-3 rounded-[var(--radius-card)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">
          Reading{bookTitle ? ` "${bookTitle}"` : ""}? Start a focus block.
        </p>
        <p className="text-[12px] text-muted">
          Running the timer while you read logs the time and builds Comprehension.
        </p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="glassx-dark inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        Start <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-full px-2 py-1 text-[13px] text-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
