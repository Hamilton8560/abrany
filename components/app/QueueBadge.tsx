"use client";

import { useEffect, useState } from "react";

type State = { active: number; queued: number; max: number };

/** Live indicator of the shared MiniMax queue: how many AI calls are running/waiting. */
export default function QueueBadge() {
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/queue", { cache: "no-store" });
        const data = (await res.json()) as State;
        if (alive) setS(data);
      } catch {
        /* ignore transient errors */
      }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const busy = !!s && (s.active > 0 || s.queued > 0);

  return (
    <div className="glassx flex items-center gap-2.5 rounded-full px-3 py-2">
      <span
        className={`relative grid size-2.5 place-items-center rounded-full ${
          busy ? "bg-accent" : "bg-up"
        }`}
      >
        {busy && (
          <span className="anim-hotspot absolute inset-0 rounded-full bg-accent" />
        )}
      </span>
      <span className="text-[11px] font-medium text-muted">
        {s
          ? busy
            ? `AI ${s.active}/${s.max}${s.queued ? ` · ${s.queued} queued` : ""}`
            : "AI idle"
          : "AI …"}
      </span>
    </div>
  );
}
