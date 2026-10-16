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
  getPlanForGoal,
  createPlan,
  createLessonStubs,
  ensureExams,
  setGoalBuild,
  listLessons,
  type Job,
} from "./repo";
import {
  generateLessonContent,
  generatePresentation,
  generateChapter,
  generateStudyGuide,
  translateMarkdownChunked,
  translateLine,
  generatePlanV2,
  expandMilestone,
  DEFAULT_INTAKE,
  generateManual,
  type PlanIntake,
} from "./coach";
import {
  getManual,
  manualContent,
  manualImages,
  manualRequest,
  setManualContent,
  setManualImage,
  setManualStatus,
  figureSteps,
} from "./workshop";
import { generateIllustration, imageKeyFor, saveManualImage } from "./imageGen";
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
/** How many milestones a course build writes up front (the rest are prefetched as the learner advances). */
export const EAGER_MILESTONES = 2;
const WORKER_MAX_INFLIGHT = 3; // how many jobs the worker holds at once (MiniMax cap still applies inside)
const MAX_ATTEMPTS = 3;
/** Illustrations drawn per job run; the job re-queues itself for the rest so pictures never hog a worker slot. */
const IMAGES_PER_RUN = 3;

type Global = typeof globalThis & { __abranyWorker?: { inFlight: number; timer: ReturnType<typeof setInterval> } };
const g = globalThis as Global;

/** A job may hand back follow-up work, queued only once it is marked done (so dedup sees it finished). */
type FollowUp = (() => void) | void;

async function processJob(job: Job): Promise<FollowUp> {
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

    // calibrate to the learner (plan intake) and place the lesson within its milestone
    let intake: { level?: "new" | "some" | "solid"; focus?: string } = {};
    try {
      intake = ctx.plan.intake ? JSON.parse(ctx.plan.intake) : {};
    } catch {
      /* legacy plan */
    }
    let outcomes: string[] = [];
    try {
      outcomes = JSON.parse(ctx.item.outcomes || "[]");
    } catch {
      /* legacy row */
    }
    // generateLessonContent → complete() already routes through the shared queue;
    // do NOT wrap again here or nested acquisition can deadlock the cap.
    const content = await generateLessonContent({
      goalTitle: ctx.goal.title,
      goalDescription: ctx.goal.description,
      milestoneTitle: ctx.item.title,
      milestoneDetail: ctx.item.detail,
      milestoneOutcomes: outcomes,
      lessonTitle: lesson.title,
      lessonObjective: lesson.objective,
      kind: lesson.kind,
      siblingTitles: listLessons(lesson.plan_item_id).map((l) => l.title),
      level: intake.level,
      focus: intake.focus,
      sources,
    });
    setLessonContent(lessonId, content, sources);
    return;
  }

  if (job.type === "build_course") {
    // Build a whole course in the background: plan (if missing) → sections for every
    // milestone → exams → queue every section's content. This is what makes "Assign
    // education" hand the employee a ready course instead of an empty goal.
    const payload = JSON.parse(job.payload) as { goalId: number; intake?: Partial<PlanIntake> };
    const goal = getGoal(payload.goalId);
    if (!goal) return;
    setGoalBuild(goal.id, "building");
    const intake: PlanIntake = { ...DEFAULT_INTAKE, ...(payload.intake ?? {}) };
    let plan = getPlanForGoal(goal.id);
    if (!plan || !plan.items.length) {
      const generated = await generatePlanV2(goal, intake);
      createPlan(goal.id, generated.title, generated.summary, generated.items, { version: 2, intake });
      plan = getPlanForGoal(goal.id)!;
    }
    for (const item of plan.items) {
      if (item.lessons_total > 0) continue; // resumed after a crash — keep what exists
      const stubs = await expandMilestone({
        goalTitle: goal.title,
        goalDescription: goal.description,
        milestoneTitle: item.title,
        milestoneDetail: item.detail,
      });
      createLessonStubs(item.id, stubs);
    }
    ensureExams(goal.id);
    // Just-in-time content: write the first milestones now so the learner can start
    // immediately; later milestones are prefetched as they advance (see prefetchNextMilestone).
    // Queuing all 50+ sections of a course at once would monopolize the shared AI queue.
    for (const item of plan.items.slice(0, EAGER_MILESTONES)) {
      for (const l of listLessons(item.id)) if (l.status === "stub" || l.status === "error") enqueueLesson(l.id, job.user_id ?? 0);
    }
    setGoalBuild(goal.id, "ready");
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

  if (job.type === "generate_manual") {
    const { manualId } = JSON.parse(job.payload) as { manualId: number };
    const row = getManual(manualId);
    if (!row) return;
    setManualStatus(manualId, "generating");
    const manual = await generateManual(row.kind, manualRequest(row));
    setManualContent(manualId, manual);
    enqueueManualImages(manualId, row.user_id);
    return;
  }

  if (job.type === "generate_manual_images") {
    const { manualId, only } = JSON.parse(job.payload) as { manualId: number; only?: string };
    const row = getManual(manualId);
    const manual = row && manualContent(row);
    const user = row && getUser(row.user_id);
    if (!row || !manual || !user) return;
    const key = imageKeyFor(user);
    if (!key) return; // no image access: the manual reads fine without pictures
    const state = manualImages(row);
    const todo = figureSteps(manual).filter((s) => (only ? s.key === only : state[s.key] !== "ready" && state[s.key] !== "error"));
    for (const step of todo.slice(0, IMAGES_PER_RUN)) {
      setManualImage(manualId, step.key, "pending");
      try {
        saveManualImage(manualId, step.key, await generateIllustration(step.figure, key));
        setManualImage(manualId, step.key, "ready");
      } catch (err) {
        console.warn(`[workshop] illustration ${manualId}/${step.key} failed`, err);
        setManualImage(manualId, step.key, "error");
      }
    }
    // hand off the rest — after this job is finished, or dedup would just return this one
    if (!only && todo.length > IMAGES_PER_RUN) return () => void enqueueManualImages(manualId, row.user_id);
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
    withLlm(creds, () => processJob(job), lang, { priority: "background" })
      .then((followUp) => {
        finishJob(job.id, "done");
        followUp?.();
      })
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
            goalId?: number;
            manualId?: number;
          };
          if (p.lessonId) setLessonStatus(p.lessonId, finalError ? "error" : "queued", finalError ? msg : "");
          if (p.goalId && job.type === "build_course") setGoalBuild(p.goalId, finalError ? "error" : "queued", finalError ? msg : "");
          if (p.presentationId && finalError) setPresentationStatus(p.presentationId, "error", msg);
          if (p.chapterId) setChapterStatus(p.chapterId, finalError ? "error" : "queued", finalError ? msg : "");
          if (p.guideId && finalError) setStudyGuideStatus(p.guideId, "error", msg);
          if (p.manualId && finalError && job.type === "generate_manual") setManualStatus(p.manualId, "error", msg);
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

/**
 * Prefetch: when the learner touches a section, make sure its milestone AND the next one
 * are being written, so content is always one step ahead of them without generating a
 * whole course nobody may finish.
 */
export function prefetchAround(planItemId: number, userId: number): number {
  const ctx = planItemWithContext(planItemId);
  if (!ctx) return 0;
  const plan = getPlanForGoal(ctx.goal.id);
  if (!plan) return 0;
  const idx = plan.items.findIndex((it) => it.id === planItemId);
  if (idx < 0) return 0;
  let queued = 0;
  for (const item of plan.items.slice(idx, idx + 2)) {
    for (const l of listLessons(item.id)) {
      if (l.status === "stub" || l.status === "error") {
        enqueueLesson(l.id, userId);
        queued++;
      }
    }
  }
  return queued;
}

/** Queue a whole-course build (plan + sections + exams + content) for a goal (idempotent). */
export function enqueueBuildCourse(goalId: number, userId: number, intake?: Partial<PlanIntake>): Job {
  const existing = findActiveJob(`course:${goalId}`);
  if (existing) return existing;
  setGoalBuild(goalId, "queued");
  const job = enqueueJobRow("build_course", { goalId, intake: intake ?? {} }, userId, `course:${goalId}`);
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

/** Queue a workshop manual for background generation (idempotent). */
export function enqueueManual(manualId: number, userId: number): Job {
  const existing = findActiveJob(`manual:${manualId}`);
  if (existing) return existing;
  setManualStatus(manualId, "generating");
  const job = enqueueJobRow("generate_manual", { manualId }, userId, `manual:${manualId}`);
  ensureWorker();
  return job;
}

/** Queue step illustrations for a manual — all missing ones, or redraw just `only`. */
export function enqueueManualImages(manualId: number, userId: number, only?: string): Job {
  const key = only ? `manual-image:${manualId}:${only}` : `manual-images:${manualId}`;
  const existing = findActiveJob(key);
  if (existing) return existing;
  if (only) setManualImage(manualId, only, "pending");
  const job = enqueueJobRow("generate_manual_images", only ? { manualId, only } : { manualId }, userId, key);
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
