"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { schedule, dueLabel, type Rating } from "@/lib/srs";
import type { DueLesson, SrsUpcoming } from "@/lib/repo";
import Markdown from "@/components/app/Markdown";
import ReviewQuiz from "@/components/app/ReviewQuiz";
import { ReviewIcon } from "@/components/icons";

type Resp = { due: DueLesson[]; summary: SrsUpcoming };

const RATINGS: { key: Rating; label: string; tone: string }[] = [
  { key: "again", label: "Again", tone: "bg-accent/12 text-accent hover:bg-accent/20" },
  { key: "hard", label: "Hard", tone: "bg-white/70 text-ink hover:bg-white" },
  { key: "good", label: "Good", tone: "bg-white/70 text-ink hover:bg-white" },
  { key: "easy", label: "Easy", tone: "bg-up/15 text-up hover:bg-up/25" },
];

export default function ReviewPage() {
  const [queue, setQueue] = useState<DueLesson[] | null>(null);
  const [summary, setSummary] = useState<SrsUpcoming | null>(null);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [quizzing, setQuizzing] = useState(false);
  const [suggested, setSuggested] = useState<Rating | null>(null);
  const [grading, setGrading] = useState(false);
  const [recall, setRecall] = useState("");
  const [verdict, setVerdict] = useState<string | null>(null);

  const resetCard = () => {
    setRevealed(false);
    setQuizzing(false);
    setSuggested(null);
    setRecall("");
    setVerdict(null);
  };

  const load = useCallback(async () => {
    const d = await api<Resp>("/api/reviews");
    setQueue(d.due);
    setSummary(d.summary);
    setI(0);
    resetCard();
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const current = queue?.[i];

  const grade = async (rating: Rating) => {
    if (!current || grading) return;
    setGrading(true);
    try {
      await api(`/api/reviews/${current.id}`, {
        method: "POST",
        body: JSON.stringify({ rating, recall_text: recall, verdict: verdict ?? undefined }),
      });
      resetCard();
      setI((n) => n + 1);
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            REVIEW · SPACED FOLLOW-UPS
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
          Make it stick
        </h1>
        {summary && (
          <p className="mt-2 text-[14px] text-muted">
            {summary.dueToday > 0
              ? `${summary.dueToday} due today · ${summary.enrolled} in your review rotation.`
              : `${summary.enrolled} lessons in rotation. Your coach resurfaces weak ones and spaces out the ones you know.`}
          </p>
        )}
      </header>

      {queue === null && <p className="text-[14px] text-muted">Loading…</p>}

      {queue && !current && (
        <section className="glass flex flex-col items-center gap-4 rounded-[var(--radius-card-lg)] px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-up/15 text-up">
            <ReviewIcon className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-[22px] font-extrabold uppercase text-ink">All caught up</h2>
            <p className="mt-1.5 max-w-[400px] text-[14px] text-muted">
              {summary?.enrolled
                ? "Nothing due right now — come back when your coach follows up. Add more lessons to your rotation from any goal."
                : "Nothing in your review rotation yet. Open a lesson and tap “Add to reviews” to have your coach follow up over time."}
            </p>
          </div>
          <Link
            href="/app/goals"
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
          >
            Go to goals
          </Link>
        </section>
      )}

      {current && (
        <section className="glass flex flex-col rounded-[var(--radius-card-lg)] p-6">
          <div className="flex items-center justify-between">
            <Link
              href={`/app/goals/${current.goal_id}`}
              className="truncate text-[12px] font-medium text-muted hover:text-ink"
            >
              {current.goal_title} · {current.milestone_title}
            </Link>
            <span className="text-[12px] text-muted">
              {i + 1} / {queue!.length}
            </span>
          </div>

          <h2 className="mt-3 font-display text-[24px] font-extrabold uppercase leading-[1.05] text-ink">
            {current.title}
          </h2>

          <div className="mt-4 rounded-[14px] bg-white/55 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              From memory — no peeking
            </p>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink">
              {current.objective || "Explain what you learned in this lesson, in your own words."}
            </p>
            <textarea
              value={recall}
              onChange={(e) => setRecall(e.target.value)}
              disabled={quizzing}
              rows={4}
              placeholder="Write what you remember…"
              className="mt-3 w-full resize-none rounded-[12px] border border-line bg-white/70 px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50 disabled:opacity-70"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setRevealed((v) => !v)}
              className="glassx rounded-full px-4 py-2 text-[13px] font-semibold text-ink"
            >
              {revealed ? "Hide lesson" : "Reveal & self-rate"}
            </button>
            {!quizzing && (
              <button
                onClick={() => setQuizzing(true)}
                disabled={!recall.trim()}
                title={recall.trim() ? "Have your coach grade your recall" : "Write your recall first"}
                className="glassx-dark rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Grade my recall
              </button>
            )}
          </div>

          {revealed && (
            <div className="mt-3 max-h-[42vh] overflow-y-auto rounded-[14px] border border-line bg-white/40 p-4">
              <Markdown>{current.content}</Markdown>
            </div>
          )}

          {quizzing && (
            <ReviewQuiz
              key={current.id}
              lessonId={current.id}
              objective={current.objective}
              recall={recall}
              onSuggest={setSuggested}
              onVerdict={setVerdict}
            />
          )}

          {/* grade buttons — the coach's suggested rating (after a quiz) is highlighted */}
          <div className="mt-6 border-t border-line/70 pt-5">
            <p className="mb-3 text-[12px] font-medium text-muted">
              {suggested ? "Confirm your rating (coach suggests the highlighted one):" : "How well did you remember it?"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => {
                const next = schedule(
                  {
                    interval: current.srs_interval,
                    ease: current.srs_ease,
                    reps: current.srs_reps,
                  },
                  r.key,
                );
                return (
                  <button
                    key={r.key}
                    onClick={() => grade(r.key)}
                    disabled={grading}
                    className={`flex flex-col items-center gap-0.5 rounded-[13px] px-2 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${r.tone} ${
                      suggested === r.key ? "ring-2 ring-accent ring-offset-1" : ""
                    }`}
                  >
                    {r.label}
                    <span className="text-[10px] font-normal opacity-70">{dueLabel(next.interval)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
