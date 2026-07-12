"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Lesson } from "@/lib/repo";
import Markdown from "./Markdown";
import ListenButton from "./ListenButton";
import { ChevronDown, CheckIcon } from "@/components/icons";

const KIND_LABEL: Record<Lesson["kind"], string> = {
  read: "Read",
  teach: "Lecture",
  practice: "Practice",
  apply: "Apply",
  check: "Self-check",
  review: "Review",
};
const kindLabel = (k: string) => KIND_LABEL[k as Lesson["kind"]] ?? "Lesson";

export default function MilestoneLessons({
  planItemId,
  milestoneTitle,
}: {
  planItemId: number;
  milestoneTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Lesson | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const d = await api<{ lessons: Lesson[] }>(`/api/plan-items/${planItemId}/lessons`);
    setLessons(d.lessons);
    // keep the open viewer in sync as content arrives
    setViewing((v) => (v ? d.lessons.find((l) => l.id === v.id) ?? v : v));
    return d.lessons;
  }, [planItemId]);

  // poll while anything is generating
  useEffect(() => {
    const pending = lessons?.some((l) => l.status === "queued" || l.status === "generating");
    if (pending && !pollRef.current) {
      pollRef.current = setInterval(() => refresh().catch(() => {}), 2500);
    } else if (!pending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !pending) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [lessons, refresh]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && lessons === null) {
      setExpanding(true);
      setError(null);
      try {
        // POST is idempotent: expands into lesson stubs on first open, else returns them
        const d = await api<{ lessons: Lesson[] }>(`/api/plan-items/${planItemId}/lessons`, {
          method: "POST",
        });
        setLessons(d.lessons);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not break this into lessons");
      } finally {
        setExpanding(false);
      }
    }
  };

  const generateOne = async (lesson: Lesson) => {
    setLessons((ls) => ls?.map((l) => (l.id === lesson.id ? { ...l, status: "queued" } : l)) ?? ls);
    await api(`/api/lessons/${lesson.id}/generate`, { method: "POST" }).catch(() => {});
    refresh().catch(() => {});
  };

  const prepareAll = async () => {
    const pending = lessons?.filter((l) => l.status === "stub" || l.status === "error") ?? [];
    setLessons(
      (ls) =>
        ls?.map((l) => (l.status === "stub" || l.status === "error" ? { ...l, status: "queued" } : l)) ??
        ls,
    );
    if (pending.length) await api(`/api/plan-items/${planItemId}/prepare`, { method: "POST" }).catch(() => {});
    refresh().catch(() => {});
  };

  const readyCount = lessons?.filter((l) => l.status === "ready").length ?? 0;
  const total = lessons?.length ?? 0;
  const anyPending = lessons?.some((l) => l.status === "queued" || l.status === "generating");

  return (
    <div className="mt-2.5 border-t border-line/60 pt-2.5">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-left text-[12px] font-semibold text-accent"
      >
        <span>
          {total > 0 ? `Lessons · ${readyCount}/${total} ready` : "Break into lessons & study"}
        </span>
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          {expanding && (
            <p className="text-[12.5px] text-muted">
              Breaking “{milestoneTitle}” into lessons…
            </p>
          )}
          {error && <p className="text-[12.5px] text-accent">{error}</p>}

          {lessons && lessons.length > 0 && (
            <>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] text-muted">
                  {anyPending ? "Generating in the background…" : "Study at your own pace"}
                </span>
                {lessons.some((l) => l.status === "stub" || l.status === "error") && (
                  <button
                    onClick={prepareAll}
                    className="glassx rounded-full px-3 py-1 text-[11.5px] font-semibold text-ink"
                  >
                    Prepare all
                  </button>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {lessons.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-[12px] bg-white/60 px-3.5 py-2.5"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                        l.status === "ready" ? "bg-up/15 text-up" : "bg-accent/12 text-accent"
                      }`}
                    >
                      {l.status === "ready" ? <CheckIcon className="size-3.5" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{l.title}</p>
                      <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
                        {kindLabel(l.kind)}
                        {l.needs_current ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-1.5 py-0.5 font-semibold text-accent">
                            <span className="size-1 rounded-full bg-accent" /> Live sources
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <LessonAction lesson={l} onGenerate={() => generateOne(l)} onRead={() => setViewing(l)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {viewing && <LessonViewer lesson={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function LessonAction({
  lesson,
  onGenerate,
  onRead,
}: {
  lesson: Lesson;
  onGenerate: () => void;
  onRead: () => void;
}) {
  if (lesson.status === "ready")
    return (
      <button
        onClick={onRead}
        className="glassx-dark shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-white"
      >
        Read
      </button>
    );
  if (lesson.status === "queued" || lesson.status === "generating")
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-muted">
        <span className="size-2 animate-pulse rounded-full bg-accent" />
        {lesson.status === "queued" ? "Queued" : "Writing…"}
      </span>
    );
  if (lesson.status === "error")
    return (
      <button onClick={onGenerate} className="shrink-0 text-[11.5px] font-semibold text-accent">
        Retry
      </button>
    );
  return (
    <button
      onClick={onGenerate}
      className="glassx shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-ink"
    >
      Generate
    </button>
  );
}

function LessonViewer({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="glass my-auto w-full max-w-[680px] rounded-[var(--radius-card-lg)] p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              {kindLabel(lesson.kind)}
            </p>
            <h3 className="mt-1 font-display text-[24px] font-extrabold uppercase leading-[1.05] text-ink">
              {lesson.title}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {lesson.content ? <ListenButton text={lesson.content} /> : null}
            <button
              onClick={onClose}
              className="glassx rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink"
            >
              Close
            </button>
          </div>
        </div>
        {lesson.content ? (
          <Markdown>{lesson.content}</Markdown>
        ) : (
          <p className="text-[14px] text-muted">This lesson has no content yet.</p>
        )}
      </div>
    </div>
  );
}
