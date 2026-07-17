"use client";

import { useEffect, useState } from "react";

type State = { active: number; queued: number; max: number };

/**
 * Live "how long will this take" line for a pending generation. Polls the shared
 * AI queue and tells the user how many requests are ahead — and, when the work is
 * durable (a background job), that they can safely leave the page.
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

  const busy = !!s && (s.active > 0 || s.queued > 0);
  const ahead = s?.queued ?? 0;

  return (
    <p className="text-[11.5px] leading-relaxed text-muted">
      {s
        ? busy
          ? `AI queue: ${s.active}/${s.max} running${ahead ? ` · ${ahead} waiting ahead of you` : ""} — usually under a minute each. `
          : "AI is free right now — should be quick. "
        : ""}
      {background
        ? "This keeps generating in the background, so you can leave this page and come back — it'll be ready when you return."
        : "Please keep this page open until it finishes."}
    </p>
  );
}
