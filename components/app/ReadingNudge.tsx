"use client";

import { useState } from "react";
import { ArrowRight } from "@/components/icons";
import { useTimer } from "@/components/timer/TimerProvider";
import { useReadingActivity } from "@/components/app/ReadingActivityContext";

/**
 * Soft, dismissible prompt encouraging the reader to run a focus block while
 * they read. Fully self-wiring: it tags the block as reading this book/chapter
 * and starts the global focus timer, so the completed block is logged as a
 * reading session (→ Temporal) by <TimerSessionBridge>.
 *
 * Drop it onto a book/chapter reader (it must be inside the app layout, which
 * provides <TimerProvider> and <ReadingActivityProvider>):
 *
 *   <ReadingNudge bookId={book.id} chapterId={chapter?.id} bookTitle={book.title} />
 *
 * It hides itself while a timer is already running, so it never nags mid-block.
 */
export default function ReadingNudge({
  bookId,
  chapterId,
  bookTitle,
}: {
  bookId?: number | null;
  chapterId?: number | null;
  bookTitle?: string;
}) {
  const { startFocus, status, hydrated } = useTimer();
  const { setReading } = useReadingActivity();
  const [dismissed, setDismissed] = useState(false);

  // only surface when idle (never mid-session) and after hydration
  if (dismissed || !hydrated || status !== "idle") return null;

  const start = () => {
    setReading({ bookId: bookId ?? null, chapterId: chapterId ?? null, title: bookTitle });
    startFocus();
  };

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
        onClick={start}
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
