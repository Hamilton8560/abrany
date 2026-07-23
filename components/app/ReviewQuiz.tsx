"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Rating } from "@/lib/srs";

type Verdict = "correct" | "partial" | "incorrect";
type Grade = {
  results: { verdict: Verdict; feedback: string }[];
  summary: string;
  suggested: Rating;
};

/**
 * "Grade my recall": the coach grades the learner's own free-recall paragraph
 * against the lesson objective — feeding a suggested spaced-repetition rating.
 * One on-demand MiniMax grade call, queued.
 */
export default function ReviewQuiz({
  lessonId,
  objective,
  recall,
  onSuggest,
  onVerdict,
}: {
  lessonId: number;
  objective: string;
  recall: string;
  onSuggest: (r: Rating) => void;
  onVerdict?: (v: Verdict) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "done" | "error">("loading");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const question = objective || "Explain what you learned in this lesson.";
    api<{ grade: Grade }>(`/api/lessons/${lessonId}/grade`, {
      method: "POST",
      body: JSON.stringify({ items: [{ question, answer: recall }] }),
    })
      .then((d) => {
        setGrade(d.grade);
        setPhase("done");
        onSuggest(d.grade.suggested);
        onVerdict?.(d.grade.results[0]?.verdict ?? "partial");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Coach is unavailable");
        setPhase("error");
      });
  }, [lessonId, objective, recall, onSuggest, onVerdict]);

  if (phase === "loading")
    return (
      <div className="mt-4 rounded-[14px] border border-line bg-white/40 px-4 py-6 text-center text-[13px] text-muted">
        Your coach is checking your recall… <span className="text-[11px]">(queued through MiniMax)</span>
      </div>
    );

  if (phase === "error")
    return (
      <div className="mt-4 rounded-[14px] bg-accent/8 px-4 py-4 text-[13px] text-accent">
        {error || "Something went wrong."} You can still self-rate below.
      </div>
    );

  return (
    <div className="mt-4 flex flex-col gap-4">
      {phase === "done" && grade && (
        <div className="rounded-[14px] bg-accent/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Coach&apos;s take
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{grade.summary}</p>
          <p className="mt-1.5 text-[12px] text-muted">
            Suggested rating below: <b className="capitalize text-ink">{grade.suggested}</b>
          </p>
        </div>
      )}
    </div>
  );
}
