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
  type Job,
} from "./repo";
import { generateLessonContent } from "./coach";
import { braveSearch } from "./search";

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
    processJob(job)
      .then(() => finishJob(job.id, "done"))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (job.attempts < MAX_ATTEMPTS) {
          requeueJob(job.id, msg);
          // reflect retry state on the lesson if applicable
          try {
            const { lessonId } = JSON.parse(job.payload) as { lessonId?: number };
            if (lessonId) setLessonStatus(lessonId, "queued");
          } catch {
            /* ignore */
          }
        } else {
          finishJob(job.id, "error", msg);
          try {
            const { lessonId } = JSON.parse(job.payload) as { lessonId?: number };
            if (lessonId) setLessonStatus(lessonId, "error", msg);
          } catch {
            /* ignore */
          }
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
export function enqueueLesson(lessonId: number): Job {
  setLessonStatus(lessonId, "queued");
  const job = enqueueJobRow("generate_lesson", { lessonId });
  ensureWorker();
  return job;
}
