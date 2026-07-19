"use client";

import { useEffect, useState } from "react";

type State = { active: number; queued: number; max: number; pending?: number; running?: number; ahead?: number };

/**
 * Live "how long will this take" line for a pending generation. Polls the shared
 * AI queue and tells the user how many generations are ahead of theirs — and,
 * when the work is durable (a background job), that they can safely leave the page.
 */
export default function QueueHint({ background = false }: { background?: boolean }) {
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/queue", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setS(d))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Prefer the durable backlog (background jobs) for "how busy is it"; fall back
  // to the in-memory concurrency gate.
  const running = s?.running ?? s?.active ?? 0;
  const pending = s?.pending ?? s?.queued ?? 0;
  const ahead = s?.ahead ?? 0;
  const busy = running > 0 || pending > 0;
  const aheadPhrase = ahead > 0 ? ` · ${ahead} ahead of you` : "";

  return (
    <p className="text-[11.5px] leading-relaxed text-muted">
      {s
        ? busy
          ? `AI queue: ${running} generating${pending ? `, ${pending} waiting` : ""}${aheadPhrase} — usually under a minute each. `
          : "AI is free right now — should be quick. "
        : ""}
      {background
        ? "This keeps generating in the background, so you can leave this page and come back — it'll be ready when you return."
        : "Please keep this page open until it finishes."}
    </p>
  );
}
