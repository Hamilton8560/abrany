"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * Segment boundary for the authenticated app. Catches a crash in any page/panel
 * (e.g. a browser-translation reconciliation error the DOM guard didn't absorb)
 * and offers a retry, so one broken view never white-screens the whole app.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <div className="max-w-[400px] text-center">
        <h2 className="mb-2 font-display text-[20px] font-extrabold text-ink">
          This view hit a snag
        </h2>
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted">
          Nothing was lost. If you just switched on a page translation, that can interrupt a live
          view — try again to reload it.
        </p>
        <button
          onClick={() => unstable_retry()}
          className="rounded-full bg-accent px-5 py-2.5 text-[13.5px] font-bold text-white"
        >
          Try again
        </button>
        {error?.digest && <p className="mt-4 text-[11px] text-muted/70">ref {error.digest}</p>}
      </div>
    </div>
  );
}
