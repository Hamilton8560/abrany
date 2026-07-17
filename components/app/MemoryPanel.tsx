"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { BrainGlyph } from "@/components/icons";

type Memory = {
  id: number;
  category: "preference" | "goal" | "struggle" | "context";
  text: string;
  source: "tutor" | "user";
  created_at: string;
};

const CAT_LABEL: Record<Memory["category"], string> = {
  preference: "Preference",
  goal: "Goal",
  struggle: "Struggle",
  context: "About you",
};

/**
 * "What your tutor remembers" — the learner's own memory, visible and editable.
 * The coach records durable facts as you talk; you can add or forget any of them.
 */
export default function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Memory["category"]>("preference");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ memories: Memory[] }>("/api/memories")
      .then((d) => setMemories(d.memories))
      .catch(() => setMemories([]));

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api<{ memories: Memory[] }>("/api/memories", {
        method: "POST",
        body: JSON.stringify({ text, category }),
      });
      setMemories(d.memories);
      setText("");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const forget = async (m: Memory) => {
    setMemories((ms) => ms?.filter((x) => x.id !== m.id) ?? ms);
    await api(`/api/memories/${m.id}`, { method: "DELETE" }).catch(() => {});
  };

  const count = memories?.length ?? 0;

  return (
    <div className="glass rounded-[var(--radius-card-lg)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-accent/12 text-accent">
            <BrainGlyph className="size-3.5" />
          </span>
          <span className="text-[13px] font-semibold text-ink">
            What your coach remembers about you
          </span>
          {count > 0 && (
            <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[11px] font-semibold text-muted">{count}</span>
          )}
        </span>
        <span className={`text-[12px] text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-line/70 p-4">
          <p className="mb-3 text-[12px] text-muted">
            Your coach uses these to personalize every conversation and steer you toward what helps most.
            It adds them as you talk; you can add or forget any of them.{" "}
            <Link href="/app/mind/about#memory" className="font-medium text-accent hover:underline">
              How this works →
            </Link>
          </p>

          {memories && memories.length > 0 ? (
            <ul className="mb-3 flex flex-col gap-2">
              {memories.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-2.5 rounded-[12px] bg-white/60 px-3.5 py-2.5"
                >
                  <span className="mt-0.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    {CAT_LABEL[m.category]}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-ink">{m.text}</span>
                  <button
                    onClick={() => forget(m)}
                    title="Forget this"
                    className="shrink-0 text-[11px] font-semibold text-muted hover:text-accent"
                  >
                    Forget
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-[12.5px] text-muted">
              Nothing yet. Tell your coach about yourself — how you learn, your goals, what trips you up —
              and it&apos;ll remember. Or add something here.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Memory["category"])}
              className="rounded-full border border-line bg-white/70 px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
            >
              <option value="preference">Preference</option>
              <option value="goal">Goal</option>
              <option value="struggle">Struggle</option>
              <option value="context">About you</option>
            </select>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. I learn best from worked examples, not theory"
              className="min-w-0 flex-1 rounded-full border border-line bg-white/70 px-4 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
            />
            <button
              onClick={add}
              disabled={busy || !text.trim()}
              className="glassx-dark shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              Remember
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
