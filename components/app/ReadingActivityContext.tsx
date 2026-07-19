"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* ───────────────────────────────────────────────────────────
   Reading activity overlay for the global focus timer.

   The timer itself (components/timer/TimerProvider) only knows
   "focus" vs "break" — it has no concept of *what* you're doing.
   This tiny context lets the reading nudge tag the current block
   as "I'm reading book X", so TimerSessionBridge can log the
   completed block as a reading session (→ Temporal) instead of a
   plain focus session (→ Prefrontal).

   It mirrors the timer's own persistence (localStorage) so a
   reading block survives a page reload while the timer runs on.
   ─────────────────────────────────────────────────────────── */

export interface ReadingActivity {
  kind: "reading";
  bookId?: number | null;
  chapterId?: number | null;
  /** external / physical book title when there's no in-app bookId */
  title?: string;
}

interface ReadingActivityApi {
  activity: ReadingActivity | null;
  /** mark the running/next block as reading a given book */
  setReading: (a: Omit<ReadingActivity, "kind">) => void;
  clear: () => void;
}

const STORAGE_KEY = "abrany.timer.activity.v1";

const Ctx = createContext<ReadingActivityApi | null>(null);

export function ReadingActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<ReadingActivity | null>(null);

  // restore after mount (avoids SSR/hydration mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setActivity(JSON.parse(raw) as ReadingActivity);
    } catch {
      /* ignore corrupted storage */
    }
  }, []);

  const persist = useCallback((next: ReadingActivity | null) => {
    setActivity(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setReading = useCallback(
    (a: Omit<ReadingActivity, "kind">) => persist({ kind: "reading", ...a }),
    [persist],
  );
  const clear = useCallback(() => persist(null), [persist]);

  const value = useMemo(
    () => ({ activity, setReading, clear }),
    [activity, setReading, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReadingActivity() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReadingActivity must be used within <ReadingActivityProvider>");
  return ctx;
}
