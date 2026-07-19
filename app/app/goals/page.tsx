"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtWhen } from "@/lib/client";
import type { Goal } from "@/lib/repo";
import { ArrowRight, CheckIcon, PlusIcon, TargetIcon } from "@/components/icons";
import DraftAssistant from "@/components/app/DraftAssistant";

type Track = { title: string; description: string };
type Gate = { rationale: string; tracks: Track[] };

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const load = () => api<{ goals: Goal[] }>("/api/goals").then((d) => setGoals(d.goals));

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setGate(null);
    setPicked(new Set());
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setChecking(true);
    setError(null);
    try {
      // scope gate: is this feasible as one plan, or does it need to be split into tracks?
      const { verdict } = await api<{
        verdict: { feasible: true } | { feasible: false; rationale: string; tracks: Track[] };
      }>("/api/goals/assess", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });

      if (!verdict.feasible) {
        setGate({ rationale: verdict.rationale, tracks: verdict.tracks });
        setPicked(new Set(verdict.tracks.map((_, i) => i))); // default: all selected
        setChecking(false);
        return;
      }

      await api("/api/goals", { method: "POST", body: JSON.stringify({ title, description }) });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal");
    } finally {
      setChecking(false);
    }
  };

  const createTracks = async () => {
    if (!gate) return;
    const tracks = gate.tracks.filter((_, i) => picked.has(i));
    if (!tracks.length) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/goals", {
        method: "POST",
        body: JSON.stringify({ title, description, tracks }),
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create tracks");
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

      {!gate && (
        <DraftAssistant
          surfaceId="goal"
          seed={title}
          onApply={(v) => {
            if (v.title) setTitle(v.title);
            if (v.description) setDescription(v.description);
          }}
          triggerLabel="Help me shape this — Draft with AI"
        />
      )}
      <form onSubmit={create} className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!!gate}
          placeholder="e.g. Become conversational in Spanish"
          className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[15px] font-medium text-ink outline-none placeholder:text-muted/60 focus:border-accent/50 disabled:opacity-60"
        />
        {!gate && (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional: current level, why it matters, time you can give it per week…"
            className="w-full resize-none rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
          />
        )}
        {error && <p className="text-[12px] text-accent">{error}</p>}

        {gate ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] bg-accent/8 px-4 py-3">
              <p className="text-[13px] font-semibold text-ink">That&apos;s a big one — let&apos;s not cram it into one plan.</p>
              {gate.rationale && <p className="mt-1 text-[12.5px] text-muted">{gate.rationale}</p>}
              <p className="mt-1.5 text-[12.5px] text-muted">
                Pick the tracks to start with. Each becomes its own goal with its own plan and lessons.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {gate.tracks.map((t, i) => {
                const on = picked.has(i);
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={`flex items-start gap-3 rounded-[13px] border px-3.5 py-3 text-left transition-colors ${
                      on ? "border-accent/40 bg-white/80" : "border-line bg-white/40 hover:bg-white/60"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border ${
                        on ? "border-accent bg-accent text-white" : "border-line bg-white text-transparent"
                      }`}
                    >
                      <CheckIcon className="size-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink">
                        <span className="mr-1.5 text-muted">{i + 1}.</span>
                        {t.title}
                      </span>
                      {t.description && (
                        <span className="mt-0.5 block text-[12.5px] text-muted">{t.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createTracks}
                disabled={saving || picked.size === 0}
                className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Creating…" : `Create ${picked.size} track${picked.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3">
            {checking && (
              <span className="text-[12px] text-muted">Checking scope with your coach…</span>
            )}
            <button
              type="submit"
              disabled={checking || !title.trim()}
              className="glassx-dark flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              <PlusIcon className="size-3.5" /> {checking ? "Checking…" : "Add goal"}
            </button>
          </div>
        )}
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
