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
  onProgress,
}: {
  planItemId: number;
  milestoneTitle: string;
  onProgress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Lesson | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mark a section read/done (optimistic) and let the parent refresh the plan %.
  const setDone = useCallback(
    async (lesson: Lesson, done: boolean) => {
      setLessons((ls) =>
        ls?.map((l) => (l.id === lesson.id ? { ...l, completed_at: done ? new Date().toISOString() : null } : l)) ?? ls,
      );
      setViewing((v) => (v && v.id === lesson.id ? { ...v, completed_at: done ? new Date().toISOString() : null } : v));
      try {
        await api(`/api/lessons/${lesson.id}`, { method: "PATCH", body: JSON.stringify({ done }) });
        onProgress?.();
      } catch {
        setLessons((ls) => ls?.map((l) => (l.id === lesson.id ? { ...l, completed_at: lesson.completed_at } : l)) ?? ls);
      }
    },
    [onProgress],
  );

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

  const total = lessons?.length ?? 0;
  const doneCount = lessons?.filter((l) => l.completed_at).length ?? 0;
  const readyCount = lessons?.filter((l) => l.status === "ready").length ?? 0;
  const anyPending = lessons?.some((l) => l.status === "queued" || l.status === "generating");
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="mt-2.5 border-t border-line/60 pt-2.5">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 text-left text-[12px] font-semibold text-accent"
      >
        <span>
          {total > 0 ? `Sections · ${doneCount}/${total} done` : "Break into lessons & study"}
        </span>
        <span className="flex items-center gap-2">
          {total > 0 && (
            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line sm:block">
              <span className="block h-full rounded-full bg-up transition-all" style={{ width: `${pct}%` }} />
            </span>
          )}
          <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
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
                {lessons.map((l) => {
                  const done = !!l.completed_at;
                  const canComplete = l.status === "ready";
                  return (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 rounded-[12px] bg-white/60 px-3.5 py-2.5"
                    >
                      {canComplete || done ? (
                        <button
                          onClick={() => setDone(l, !done)}
                          aria-label={done ? "Mark section not done" : "Mark section done"}
                          className={`grid size-6 shrink-0 place-items-center rounded-full border transition-all ${
                            done
                              ? "border-up bg-up text-white"
                              : "border-line bg-white text-transparent hover:border-up"
                          }`}
                        >
                          <CheckIcon className="size-3.5" />
                        </button>
                      ) : (
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                          {l.status === "queued" || l.status === "generating" ? (
                            <span className="size-2 animate-pulse rounded-full bg-accent" />
                          ) : null}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] font-medium ${done ? "text-muted line-through" : "text-ink"}`}>
                          {l.title}
                        </p>
                        <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
                          {kindLabel(l.kind)}
                          {done && <span className="font-semibold text-up">· Done</span>}
                          {l.needs_current ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-1.5 py-0.5 font-semibold text-accent">
                              <span className="size-1 rounded-full bg-accent" /> Live sources
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <LessonAction lesson={l} onGenerate={() => generateOne(l)} onRead={() => setViewing(l)} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {viewing && (
        <LessonViewer
          lesson={viewing}
          onClose={() => setViewing(null)}
          onSetDone={(done) => setDone(viewing, done)}
        />
      )}
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

function LessonViewer({
  lesson,
  onClose,
  onSetDone,
}: {
  lesson: Lesson;
  onClose: () => void;
  onSetDone: (done: boolean) => void;
}) {
  const [enrolled, setEnrolled] = useState(lesson.srs_due != null);
  const [busy, setBusy] = useState(false);
  const done = !!lesson.completed_at;

  // Reading a section completes it — auto-mark done on open (once) if it has content.
  const autoMarked = useRef(false);
  useEffect(() => {
    if (!autoMarked.current && lesson.content && !lesson.completed_at) {
      autoMarked.current = true;
      onSetDone(true);
    }
  }, [lesson.content, lesson.completed_at, onSetDone]);

  const toggleEnroll = async () => {
    setBusy(true);
    const next = !enrolled;
    setEnrolled(next);
    try {
      await api(`/api/lessons/${lesson.id}/enroll`, { method: next ? "POST" : "DELETE" });
    } catch {
      setEnrolled(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="glass my-auto w-full max-w-[680px] rounded-[var(--radius-card-lg)] p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              {kindLabel(lesson.kind)}
            </p>
            <h3 className="mt-1 font-display text-[clamp(20px,5vw,24px)] font-extrabold uppercase leading-[1.05] text-ink">
              {lesson.title}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <button
              onClick={() => onSetDone(!done)}
              title={done ? "Marked done — click to undo" : "Mark this section done"}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                done ? "bg-up/15 text-up" : "glassx text-ink"
              }`}
            >
              {done ? "✓ Done" : "Mark done"}
            </button>
            <button
              onClick={toggleEnroll}
              disabled={busy}
              title={enrolled ? "In your spaced-review rotation" : "Have your coach follow up on this over time"}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${
                enrolled ? "bg-up/15 text-up" : "glassx text-ink"
              }`}
            >
              {enrolled ? "✓ In reviews" : "Add to reviews"}
            </button>
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
