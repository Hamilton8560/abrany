"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtWhen } from "@/lib/client";
import type { Goal } from "@/lib/repo";
import { ArrowRight, PlusIcon, TargetIcon } from "@/components/icons";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<{ goals: Goal[] }>("/api/goals").then((d) => setGoals(d.goals));

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/goals", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      setTitle("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal");
    } finally {
      setSaving(false);
    }
  };

  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-8">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            GOALS & LEARNING OBJECTIVES
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
          What do you want to master?
        </h1>
        <p className="mt-2 max-w-[480px] text-[14px] text-muted">
          Name the ambition — big or small. Your coach turns it into a realistic, staged plan.
        </p>
      </header>

      <form onSubmit={create} className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Become conversational in Spanish"
          className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[15px] font-medium text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional: current level, why it matters, time you can give it per week…"
          className="w-full resize-none rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
        />
        {error && <p className="text-[12px] text-accent">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="glassx-dark flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            <PlusIcon className="size-3.5" /> {saving ? "Adding…" : "Add goal"}
          </button>
        </div>
      </form>

      <section className="flex flex-col gap-3">
        {active.length === 0 && (
          <p className="text-[14px] text-muted">No active goals yet.</p>
        )}
        {active.map((g) => (
          <GoalRow key={g.id} goal={g} />
        ))}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">Completed</h2>
          {done.map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
        </section>
      )}
    </div>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  return (
    <Link
      href={`/app/goals/${goal.id}`}
      className="glass group flex items-center gap-4 rounded-[var(--radius-card)] p-4 transition-transform hover:-translate-y-0.5"
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-[13px] ${
          goal.status === "done" ? "bg-up/15 text-up" : "bg-accent/12 text-accent"
        }`}
      >
        <TargetIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{goal.title}</p>
        <p className="truncate text-[12.5px] text-muted">
          {goal.description || "No details"} · {fmtWhen(goal.created_at)}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
