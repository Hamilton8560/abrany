import {
  claimJobs,
  finishJob,
  requeueJob,
  enqueueJobRow,
  recoverOrphanedJobs,
  getLesson,
  setLessonStatus,
  setLessonContent,
  planItemWithContext,
  getPresentation,
  setPresentationContent,
  setPresentationStatus,
  getGoal,
  chapterWithBook,
  listChapters,
  setChapterStatus,
  setChapterContent,
  getUser,
  type Job,
} from "./repo";
import { generateLessonContent, generatePresentation, generateChapter } from "./coach";
import { braveSearch } from "./search";
import { withLlm, resolveUserLlm } from "./minimax";

/**
 * Durable, continuous background worker. Jobs live in the `jobs` table so they
 * survive restarts; a self-scheduling tick claims queued jobs and runs them
 * through the shared MiniMax concurrency queue. This is what makes content
 * generation async — the UI enqueues and polls, never blocks.
 */

const TICK_MS = 1200;
const WORKER_MAX_INFLIGHT = 3; // how many jobs the worker holds at once (MiniMax cap still applies inside)
const MAX_ATTEMPTS = 3;

type Global = typeof globalThis & { __abranyWorker?: { inFlight: number; timer: ReturnType<typeof setInterval> } };
const g = globalThis as Global;

async function processJob(job: Job): Promise<void> {
  if (job.type === "generate_lesson") {
    const { lessonId } = JSON.parse(job.payload) as { lessonId: number };
    const lesson = getLesson(lessonId);
    if (!lesson) return; // orphaned — nothing to do
    setLessonStatus(lessonId, "generating");
    const ctx = planItemWithContext(lesson.plan_item_id);
    if (!ctx) throw new Error("Lesson milestone context missing");

    // time-sensitive lessons: pull live web sources to ground the content
    const sources = lesson.needs_current
      ? await braveSearch(`${lesson.title} ${ctx.goal.title}`, 6)
      : [];

    // generateLessonContent → complete() already routes through the shared queue;
    // do NOT wrap again here or nested acquisition can deadlock the cap.
    const content = await generateLessonContent({
      goalTitle: ctx.goal.title,
      milestoneTitle: ctx.item.title,
      lessonTitle: lesson.title,
      lessonObjective: lesson.objective,
      kind: lesson.kind,
      sources,
    });
    setLessonContent(lessonId, content, sources);
    return;
  }

  if (job.type === "generate_presentation") {
    const { presentationId } = JSON.parse(job.payload) as { presentationId: number };
    const pres = getPresentation(presentationId);
    if (!pres) return;
    const goal = pres.goal_id ? getGoal(pres.goal_id) : undefined;
    const { title, content } = await generatePresentation({
      topic: pres.topic,
      goalTitle: goal?.title,
    });
    setPresentationContent(presentationId, title, content);
    return;
  }

  if (job.type === "generate_chapter") {
    const { chapterId } = JSON.parse(job.payload) as { chapterId: number };
    const ctx = chapterWithBook(chapterId);
    if (!ctx) return;
    setChapterStatus(chapterId, "generating");
    const outlineTitles = listChapters(ctx.book.id).map((c) => c.title);
    const content = await generateChapter({
      bookTitle: ctx.book.title,
      bookBrief: ctx.book.brief,
      chapterNumber: ctx.chapter.order_index + 1,
      chapterTitle: ctx.chapter.title,
      chapterSummary: ctx.chapter.summary,
      outlineTitles,
    });
    setChapterContent(chapterId, content);
    return;
  }

  throw new Error(`Unknown job type: ${job.type}`);
}

function tick() {
  const w = g.__abranyWorker;
  if (!w) return;
  const available = WORKER_MAX_INFLIGHT - w.inFlight;
  if (available <= 0) return;

  const jobs = claimJobs(available);
  for (const job of jobs) {
    w.inFlight++;
    // run generation with the enqueuing user's AI credentials (owner → server env)
    const user = job.user_id ? getUser(job.user_id) : undefined;
    const creds = user ? (() => { const r = resolveUserLlm(user); return r.mode === "byo" ? r.creds : null; })() : null;
    withLlm(creds, () => processJob(job))
      .then(() => finishJob(job.id, "done"))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        const finalError = job.attempts >= MAX_ATTEMPTS;
        if (finalError) finishJob(job.id, "error", msg);
        else requeueJob(job.id, msg);
        try {
          const p = JSON.parse(job.payload) as {
            lessonId?: number;
            presentationId?: number;
            chapterId?: number;
          };
          if (p.lessonId) setLessonStatus(p.lessonId, finalError ? "error" : "queued", finalError ? msg : "");
          if (p.presentationId && finalError) setPresentationStatus(p.presentationId, "error", msg);
          if (p.chapterId) setChapterStatus(p.chapterId, finalError ? "error" : "queued", finalError ? msg : "");
        } catch {
          /* ignore */
        }
      })
      .finally(() => {
        if (g.__abranyWorker) g.__abranyWorker.inFlight--;
      });
  }
}

export function ensureWorker(): void {
  if (g.__abranyWorker) return;
  // recover jobs orphaned as 'running' by a prior crash/restart
  recoverOrphanedJobs();
  g.__abranyWorker = { inFlight: 0, timer: setInterval(tick, TICK_MS) };
  // don't keep the process alive just for the poll loop
  (g.__abranyWorker.timer as { unref?: () => void }).unref?.();
}

/** Queue a lesson for background generation. */
export function enqueueLesson(lessonId: number, userId: number): Job {
  setLessonStatus(lessonId, "queued");
  const job = enqueueJobRow("generate_lesson", { lessonId }, userId);
  ensureWorker();
  return job;
}

/** Queue a presentation deck for background generation. */
export function enqueuePresentation(presentationId: number, userId: number): Job {
  setPresentationStatus(presentationId, "generating");
  const job = enqueueJobRow("generate_presentation", { presentationId }, userId);
  ensureWorker();
  return job;
}

/** Queue one book chapter for background generation. */
export function enqueueChapter(chapterId: number, userId: number): Job {
  setChapterStatus(chapterId, "queued");
  const job = enqueueJobRow("generate_chapter", { chapterId }, userId);
  ensureWorker();
  return job;
}
