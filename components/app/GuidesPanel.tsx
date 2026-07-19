"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtWhen } from "@/lib/client";
import { GuideIcon, PlusIcon, ChatIcon } from "@/components/icons";
import Markdown from "./Markdown";
import DraftAssistant from "./DraftAssistant";
import { useContentTranslation, TranslateButton } from "./TranslateControl";
import ListenButton from "./ListenButton";
import QueueHint from "./QueueHint";

type Guide = {
  id: number;
  title: string;
  topic: string;
  source: "goal" | "milestone" | "topic" | "exam";
  content: string;
  status: "generating" | "ready" | "error";
  error: string;
  goal_id: number | null;
  created_at: string;
};

const SOURCE_LABEL: Record<Guide["source"], string> = {
  goal: "Course",
  milestone: "Milestone",
  topic: "Topic",
  exam: "From exam",
};

export default function GuidesPanel({ goals }: { goals: { id: number; title: string }[] }) {
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Guide | null>(null);
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tr = useContentTranslation("study_guide", reading?.id ?? 0, reading?.title ?? "", reading?.content ?? "");

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ guides: Guide[] }>("/api/study-guides");
      setGuides(d.guides);
      setReading((r) => (r ? d.guides.find((g) => g.id === r.id) ?? r : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your study guides");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // poll while anything is generating
  useEffect(() => {
    const pending = guides?.some((g) => g.status === "generating");
    if (pending && !pollRef.current) pollRef.current = setInterval(() => refresh().catch(() => {}), 2500);
    else if (!pending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !pending) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [guides, refresh]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const remove = async (g: Guide) => {
    if (!window.confirm(`Delete study guide "${g.title}"?`)) return;
    setGuides((gs) => gs?.filter((x) => x.id !== g.id) ?? gs);
    if (reading?.id === g.id) setReading(null);
    await api(`/api/study-guides/${g.id}`, { method: "DELETE" }).catch(() => {});
  };

  /* ───────── READER ───────── */
  if (reading) {
    return (
      <div className="flex flex-col gap-5">
        <button
          onClick={() => setReading(null)}
          className="self-start text-[13px] font-medium text-muted hover:text-ink"
        >
          ← All study guides
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              {SOURCE_LABEL[reading.source]} study guide
            </p>
            <h2 className="mt-1 font-display text-[clamp(22px,4vw,30px)] font-extrabold uppercase leading-[1.05] text-ink">
              {tr.displayTitle}
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {reading.status === "ready" && reading.content && <TranslateButton t={tr} />}
            {reading.status === "ready" && reading.content && <ListenButton text={tr.displayContent} />}
            <Link
              href={`/app/coach?guide=${reading.id}`}
              className="glassx-dark flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white"
            >
              <ChatIcon className="size-4" /> Discuss with tutor
            </Link>
          </div>
        </div>

        <article className="glass rounded-[var(--radius-card-lg)] p-6 sm:p-8 [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-wide [&_p]:text-[15px] [&_p]:leading-[1.7] [&_li]:text-[15px]">
          {reading.status === "ready" ? (
            <Markdown>{tr.displayContent}</Markdown>
          ) : reading.status === "error" ? (
            <p className="text-[14px] text-accent">Generation failed: {reading.error || "unknown error"}</p>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-[14px] text-muted">Writing your study guide…</p>
              <div className="max-w-[400px]">
                <QueueHint background />
              </div>
            </div>
          )}
        </article>
      </div>
    );
  }

  /* ───────── LIST ───────── */
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">{guides?.length ? `${guides.length} saved` : ""}</p>
        <button
          onClick={() => setCreating(true)}
          className="glassx-dark flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
        >
          <PlusIcon className="size-4" /> New study guide
        </button>
      </div>

      {error && <p className="text-[13px] text-accent">{error}</p>}

      {creating && (
        <CreateGuide
          goals={goals}
          onClose={() => setCreating(false)}
          onCreated={(g) => {
            setCreating(false);
            setGuides((gs) => [g, ...(gs ?? [])]);
            if (g.status === "ready") setReading(g);
          }}
        />
      )}

      {!guides ? (
        <p className="text-[13px] text-muted">Loading…</p>
      ) : guides.length === 0 && !creating ? (
        <div className="glass flex flex-col items-center gap-3 rounded-[var(--radius-card-lg)] px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-accent/12 text-accent">
            <GuideIcon className="size-6" />
          </span>
          <p className="max-w-[380px] text-[13.5px] text-muted">
            No study guides yet. Generate one for a course you&apos;re taking or any topic — then keep it
            and talk it through with your tutor.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {guides.map((g) => (
            <li
              key={g.id}
              className="glass flex items-center gap-3 rounded-[16px] px-4 py-3.5"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent/12 text-accent">
                <GuideIcon className="size-5" />
              </span>
              <button
                onClick={() => g.status !== "generating" && setReading(g)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-[14px] font-semibold text-ink">{g.title}</p>
                <p className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full bg-ink/8 px-2 py-0.5 font-medium">{SOURCE_LABEL[g.source]}</span>
                  {g.status === "generating" ? (
                    <span className="flex items-center gap-1 text-accent">
                      <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Writing…
                    </span>
                  ) : g.status === "error" ? (
                    <span className="text-accent">Failed</span>
                  ) : (
                    <span>{fmtWhen(g.created_at)}</span>
                  )}
                </p>
              </button>
              {g.status === "ready" && (
                <Link
                  href={`/app/coach?guide=${g.id}`}
                  title="Discuss with tutor"
                  className="glassx grid size-8 shrink-0 place-items-center rounded-full text-ink"
                >
                  <ChatIcon className="size-4" />
                </Link>
              )}
              <button
                onClick={() => remove(g)}
                className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-accent"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateGuide({
  goals,
  onClose,
  onCreated,
}: {
  goals: { id: number; title: string }[];
  onClose: () => void;
  onCreated: (g: Guide) => void;
}) {
  const [mode, setMode] = useState<"goal" | "topic">(goals.length ? "goal" : "topic");
  const [goalId, setGoalId] = useState(goals[0]?.id ? String(goals[0].id) : "");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const body =
        mode === "goal" ? { goalId: Number(goalId) } : { topic: topic.trim() };
      if (mode === "topic" && !topic.trim()) {
        setErr("Enter a topic");
        setBusy(false);
        return;
      }
      const d = await api<{ guide: Guide }>("/api/study-guides", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(d.guide);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the study guide");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">New study guide</p>
        <button onClick={onClose} className="text-[12px] font-semibold text-muted hover:text-ink">
          Cancel
        </button>
      </div>
      {goals.length > 0 && (
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode("goal")}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${mode === "goal" ? "glassx-dark text-white" : "glassx text-ink"}`}
          >
            From a course
          </button>
          <button
            onClick={() => setMode("topic")}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${mode === "topic" ? "glassx-dark text-white" : "glassx text-ink"}`}
          >
            From a topic
          </button>
        </div>
      )}
      {mode === "goal" && goals.length > 0 ? (
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        >
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="What should the guide cover? e.g. Spanish past tenses, Ohm's law"
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <DraftAssistant
            surfaceId="studyGuide"
            seed={topic}
            onApply={(v) => v.topic && setTopic(v.topic)}
            triggerLabel="Narrow it down with AI"
          />
        </div>
      )}
      {err && <p className="text-[12px] text-accent">{err}</p>}
      <div className="flex justify-end">
        <button
          onClick={create}
          disabled={busy}
          className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Starting…" : "Generate"}
        </button>
      </div>
      <p className="text-[11px] text-muted">
        {mode === "goal"
          ? "Built from the lessons you've generated for that course."
          : "A standalone guide on any topic you name."}
      </p>
    </div>
  );
}
