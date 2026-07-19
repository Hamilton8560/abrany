import {
  claimJobs,
  finishJob,
  requeueJob,
  enqueueJobRow,
  findActiveJob,
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
  getStudyGuide,
  setStudyGuideContent,
  setStudyGuideStatus,
  goalReadySections,
  milestoneReadySections,
  type Job,
} from "./repo";
import {
  generateLessonContent,
  generatePresentation,
  generateChapter,
  generateStudyGuide,
  translateMarkdownChunked,
  translateLine,
} from "./coach";
import { braveSearch } from "./search";
import { withLlm, resolveUserLlm } from "./minimax";
import { readContent, saveTranslation, isContentKind } from "./translate";
import { languageName } from "./languages";

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

  if (job.type === "generate_study_guide") {
    const { guideId } = JSON.parse(job.payload) as { guideId: number };
    const guide = getStudyGuide(guideId);
    if (!guide) return;
    setStudyGuideStatus(guideId, "generating");
    const goal = guide.goal_id ? getGoal(guide.goal_id) : undefined;
    const sections =
      guide.source === "milestone" && guide.plan_item_id
        ? milestoneReadySections(guide.plan_item_id)
        : guide.goal_id
          ? goalReadySections(guide.goal_id)
          : [];
    const { title, content } = await generateStudyGuide({
      title: guide.title,
      topic: guide.topic,
      goalTitle: goal?.title,
      sections,
    });
    setStudyGuideContent(guideId, title, content);
    return;
  }

  if (job.type === "generate_translation") {
    const { kind, id, lang } = JSON.parse(job.payload) as { kind: string; id: number; lang: string };
    if (!isContentKind(kind)) return;
    const src = readContent(kind, id);
    if (!src || !src.content.trim()) return;
    const targetName = languageName(lang);
    // chunked + sequential (stingy on the shared queue); title translated after.
    const content = await translateMarkdownChunked(src.content, targetName);
    const title = src.title.trim() ? await translateLine(src.title, targetName) : src.title;
    saveTranslation(kind, id, lang, title, content, src.stamp);
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
    // translation carries its own explicit target language in the prompt — don't
    // also inject the user's-language directive or the two would fight.
    const lang = job.type === "generate_translation" ? undefined : user?.language;
    withLlm(creds, () => processJob(job), lang)
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
            guideId?: number;
          };
          if (p.lessonId) setLessonStatus(p.lessonId, finalError ? "error" : "queued", finalError ? msg : "");
          if (p.presentationId && finalError) setPresentationStatus(p.presentationId, "error", msg);
          if (p.chapterId) setChapterStatus(p.chapterId, finalError ? "error" : "queued", finalError ? msg : "");
          if (p.guideId && finalError) setStudyGuideStatus(p.guideId, "error", msg);
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

/** Queue a lesson for background generation (idempotent while one is in flight). */
export function enqueueLesson(lessonId: number, userId: number): Job {
  const existing = findActiveJob(`lesson:${lessonId}`);
  if (existing) return existing;
  setLessonStatus(lessonId, "queued");
  const job = enqueueJobRow("generate_lesson", { lessonId }, userId, `lesson:${lessonId}`);
  ensureWorker();
  return job;
}

/** Queue a presentation deck for background generation (idempotent). */
export function enqueuePresentation(presentationId: number, userId: number): Job {
  const existing = findActiveJob(`presentation:${presentationId}`);
  if (existing) return existing;
  setPresentationStatus(presentationId, "generating");
  const job = enqueueJobRow("generate_presentation", { presentationId }, userId, `presentation:${presentationId}`);
  ensureWorker();
  return job;
}

/** Queue one book chapter for background generation (idempotent). */
export function enqueueChapter(chapterId: number, userId: number): Job {
  const existing = findActiveJob(`chapter:${chapterId}`);
  if (existing) return existing;
  setChapterStatus(chapterId, "queued");
  const job = enqueueJobRow("generate_chapter", { chapterId }, userId, `chapter:${chapterId}`);
  ensureWorker();
  return job;
}

/** Queue a study guide for background generation (idempotent). */
export function enqueueStudyGuide(guideId: number, userId: number): Job {
  const existing = findActiveJob(`guide:${guideId}`);
  if (existing) return existing;
  setStudyGuideStatus(guideId, "generating");
  const job = enqueueJobRow("generate_study_guide", { guideId }, userId, `guide:${guideId}`);
  ensureWorker();
  return job;
}

/** Queue a content translation for background generation (idempotent per target). */
export function enqueueTranslation(kind: string, id: number, lang: string, userId: number): Job {
  const key = `translation:${kind}:${id}:${lang}`;
  const existing = findActiveJob(key);
  if (existing) return existing;
  const job = enqueueJobRow("generate_translation", { kind, id, lang }, userId, key);
  ensureWorker();
  return job;
}
