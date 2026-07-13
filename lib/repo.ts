import { getDb } from "./db";

/* ── Users / auth ──────────────────────────────────────────── */

export type User = {
  id: number;
  email: string;
  password_hash: string;
  is_owner: number;
  ai_provider: string;
  ai_key: string;
  ai_model: string;
  created_at: string;
};

export function createUser(email: string, passwordHash: string, isOwner = false): User {
  const info = getDb()
    .prepare("INSERT INTO users (email, password_hash, is_owner) VALUES (?, ?, ?)")
    .run(email.toLowerCase(), passwordHash, isOwner ? 1 : 0);
  return getUser(Number(info.lastInsertRowid))!;
}

export function getUser(id: number): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as
    | User
    | undefined;
}

export function setUserPassword(id: number, passwordHash: string): void {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

export function setUserAiCreds(id: number, provider: string, key: string, model: string): void {
  getDb()
    .prepare("UPDATE users SET ai_provider = ?, ai_key = ?, ai_model = ? WHERE id = ?")
    .run(provider, key, model, id);
}

/* ── app settings (key/value) ──────────────────────────────── */

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/**
 * When the owner turns this on, keyless users share the owner's built-in AI
 * (through the same concurrency queue) instead of being asked for their own key.
 */
export function isFreeAiEnabled(): boolean {
  return getSetting("free_ai_access") === "1";
}

export function setFreeAiEnabled(on: boolean): void {
  setSetting("free_ai_access", on ? "1" : "0");
}

/** One-time: adopt pre-multi-tenant rows (NULL user_id) into the owner account. */
export function backfillOwnerData(ownerId: number): void {
  const db = getDb();
  for (const t of ["goals", "sessions", "threads", "presentations", "books"]) {
    db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).run(ownerId);
  }
}

/* ── ownership checks (multi-tenant isolation) ─────────────── */
const owns = (sql: string, ...args: unknown[]) => !!getDb().prepare(sql).get(...(args as never[]));

export const userOwnsGoal = (userId: number, goalId: number) =>
  owns("SELECT 1 FROM goals WHERE id = ? AND user_id = ?", goalId, userId);

export const userOwnsPlanItem = (userId: number, planItemId: number) =>
  owns(
    `SELECT 1 FROM plan_items pi JOIN plans p ON p.id = pi.plan_id JOIN goals g ON g.id = p.goal_id
     WHERE pi.id = ? AND g.user_id = ?`,
    planItemId,
    userId,
  );

export const userOwnsLesson = (userId: number, lessonId: number) =>
  owns(
    `SELECT 1 FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id
     JOIN plans p ON p.id = pi.plan_id JOIN goals g ON g.id = p.goal_id
     WHERE l.id = ? AND g.user_id = ?`,
    lessonId,
    userId,
  );

export const userOwnsPresentation = (userId: number, id: number) =>
  owns("SELECT 1 FROM presentations WHERE id = ? AND user_id = ?", id, userId);

export const userOwnsBook = (userId: number, id: number) =>
  owns("SELECT 1 FROM books WHERE id = ? AND user_id = ?", id, userId);

export const userOwnsChapter = (userId: number, chapterId: number) =>
  owns(
    "SELECT 1 FROM chapters c JOIN books b ON b.id = c.book_id WHERE c.id = ? AND b.user_id = ?",
    chapterId,
    userId,
  );

export type Goal = {
  id: number;
  title: string;
  description: string;
  status: "active" | "done" | "archived";
  parent_goal_id: number | null;
  created_at: string;
  updated_at: string;
};

/** Pedagogical arc stages, in order. Each milestone's lessons follow this arc. */
export type LessonKind = "read" | "teach" | "practice" | "apply" | "check" | "review";

export type Lesson = {
  id: number;
  plan_item_id: number;
  title: string;
  objective: string;
  kind: LessonKind;
  order_index: number;
  status: "stub" | "queued" | "generating" | "ready" | "error";
  content: string;
  error: string;
  needs_current: number; // 0/1 — flagged for web-grounding
  sources: string; // JSON array of {title,url,description}
  srs_due: string | null; // null = not enrolled in spaced review
  srs_interval: number;
  srs_ease: number;
  srs_reps: number;
  srs_last: string | null;
  created_at: string;
  updated_at: string;
};

export type DueLesson = Lesson & {
  milestone_title: string;
  goal_id: number;
  goal_title: string;
};

export type Job = {
  id: number;
  type: string;
  payload: string;
  status: "queued" | "running" | "done" | "error";
  attempts: number;
  error: string;
  user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type Plan = {
  id: number;
  goal_id: number;
  title: string;
  summary: string;
  created_at: string;
};

export type PlanItem = {
  id: number;
  plan_id: number;
  title: string;
  detail: string;
  estimate: string;
  order_index: number;
  status: "todo" | "doing" | "done";
};

export type Session = {
  id: number;
  goal_id: number | null;
  mode: "focus" | "break";
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  notes: string;
  tags: string;
  created_at: string;
};

export type Message = {
  id: number;
  thread_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/* ── Goals ─────────────────────────────────────────────── */

export function listGoals(userId: number): Goal[] {
  return getDb()
    .prepare(
      "SELECT * FROM goals WHERE user_id = ? AND status != 'archived' AND parent_goal_id IS NULL ORDER BY status='done', updated_at DESC",
    )
    .all(userId) as Goal[];
}

export function getGoal(id: number): Goal | undefined {
  return getDb().prepare("SELECT * FROM goals WHERE id = ?").get(id) as Goal | undefined;
}

export function getChildGoals(parentId: number): Goal[] {
  return getDb()
    .prepare("SELECT * FROM goals WHERE parent_goal_id = ? AND status != 'archived' ORDER BY id")
    .all(parentId) as Goal[];
}

export function createGoal(
  userId: number,
  title: string,
  description = "",
  parentGoalId: number | null = null,
): Goal {
  const info = getDb()
    .prepare("INSERT INTO goals (user_id, title, description, parent_goal_id) VALUES (?, ?, ?, ?)")
    .run(userId, title, description, parentGoalId);
  return getGoal(Number(info.lastInsertRowid))!;
}

export function updateGoal(
  id: number,
  fields: Partial<Pick<Goal, "title" | "description" | "status">>,
): Goal | undefined {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    getDb()
      .prepare(`UPDATE goals SET ${sets.join(", ")} WHERE id = ?`)
      .run(...(vals as never[]), id);
  }
  return getGoal(id);
}

export function deleteGoal(id: number): void {
  getDb().prepare("DELETE FROM goals WHERE id = ?").run(id);
}

/* ── Plans ─────────────────────────────────────────────── */

/** Latest plan for a goal (MVP: one active plan, newest wins). */
export function getPlanForGoal(goalId: number): (Plan & { items: PlanItem[] }) | undefined {
  const plan = getDb()
    .prepare("SELECT * FROM plans WHERE goal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(goalId) as Plan | undefined;
  if (!plan) return undefined;
  const items = getDb()
    .prepare("SELECT * FROM plan_items WHERE plan_id = ? ORDER BY order_index, id")
    .all(plan.id) as PlanItem[];
  return { ...plan, items };
}

export function createPlan(
  goalId: number,
  title: string,
  summary: string,
  items: { title: string; detail?: string; estimate?: string }[],
): Plan & { items: PlanItem[] } {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO plans (goal_id, title, summary) VALUES (?, ?, ?)")
    .run(goalId, title, summary);
  const planId = Number(info.lastInsertRowid);
  const insItem = db.prepare(
    "INSERT INTO plan_items (plan_id, title, detail, estimate, order_index) VALUES (?, ?, ?, ?, ?)",
  );
  items.forEach((it, i) => insItem.run(planId, it.title, it.detail ?? "", it.estimate ?? "", i));
  return getPlanForGoal(goalId)!;
}

export function updatePlanItem(itemId: number, status: PlanItem["status"]): void {
  getDb().prepare("UPDATE plan_items SET status = ? WHERE id = ?").run(status, itemId);
}

/* ── Sessions ──────────────────────────────────────────── */

export function listSessions(userId: number, limit = 100): (Session & { goal_title: string | null })[] {
  return getDb()
    .prepare(
      `SELECT s.*, g.title AS goal_title
       FROM sessions s LEFT JOIN goals g ON g.id = s.goal_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .all(userId, limit) as (Session & { goal_title: string | null })[];
}

export function createSession(input: {
  userId: number;
  goalId?: number | null;
  mode?: "focus" | "break";
  durationSec: number;
  notes?: string;
  tags?: string;
  startedAt?: string;
  endedAt?: string;
}): Session {
  const info = getDb()
    .prepare(
      `INSERT INTO sessions (user_id, goal_id, mode, duration_sec, notes, tags, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
    )
    .run(
      input.userId,
      input.goalId ?? null,
      input.mode ?? "focus",
      Math.round(input.durationSec),
      input.notes ?? "",
      input.tags ?? "",
      input.startedAt ?? null,
      input.endedAt ?? null,
    );
  return getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as Session;
}

export type SessionStats = { totalFocusSec: number; sessionCount: number; todayFocusSec: number };

export function sessionStats(userId: number): SessionStats {
  const db = getDb();
  const total = db
    .prepare("SELECT COALESCE(SUM(duration_sec),0) n, COUNT(*) c FROM sessions WHERE mode='focus' AND user_id = ?")
    .get(userId) as { n: number; c: number };
  const today = db
    .prepare(
      "SELECT COALESCE(SUM(duration_sec),0) n FROM sessions WHERE mode='focus' AND user_id = ? AND date(created_at)=date('now')",
    )
    .get(userId) as { n: number };
  return { totalFocusSec: total.n, sessionCount: total.c, todayFocusSec: today.n };
}

/* ── Threads & messages (coach) ────────────────────────── */

export function getOrCreateDefaultThread(userId: number, goalId?: number | null): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM threads WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(userId) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db
    .prepare("INSERT INTO threads (user_id, goal_id) VALUES (?, ?)")
    .run(userId, goalId ?? null);
  return Number(info.lastInsertRowid);
}

export function listMessages(threadId: number): Message[] {
  return getDb()
    .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY id")
    .all(threadId) as Message[];
}

export function addMessage(threadId: number, role: "user" | "assistant", content: string): Message {
  const info = getDb()
    .prepare("INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)")
    .run(threadId, role, content);
  return getDb()
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as Message;
}

/* ── Lessons (generated learning content) ──────────────────── */

export function listLessons(planItemId: number): Lesson[] {
  return getDb()
    .prepare("SELECT * FROM lessons WHERE plan_item_id = ? ORDER BY order_index, id")
    .all(planItemId) as Lesson[];
}

export function getLesson(id: number): Lesson | undefined {
  return getDb().prepare("SELECT * FROM lessons WHERE id = ?").get(id) as Lesson | undefined;
}

export function planItemWithContext(planItemId: number):
  | { item: PlanItem; plan: Plan; goal: Goal }
  | undefined {
  const db = getDb();
  const item = db.prepare("SELECT * FROM plan_items WHERE id = ?").get(planItemId) as
    | PlanItem
    | undefined;
  if (!item) return undefined;
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(item.plan_id) as Plan | undefined;
  if (!plan) return undefined;
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(plan.goal_id) as Goal | undefined;
  if (!goal) return undefined;
  return { item, plan, goal };
}

export function createLessonStubs(
  planItemId: number,
  stubs: { title: string; objective?: string; kind?: LessonKind; needsCurrent?: boolean }[],
): Lesson[] {
  const db = getDb();
  const ins = db.prepare(
    "INSERT INTO lessons (plan_item_id, title, objective, kind, order_index, needs_current) VALUES (?, ?, ?, ?, ?, ?)",
  );
  stubs.forEach((s, i) =>
    ins.run(planItemId, s.title, s.objective ?? "", s.kind ?? "read", i, s.needsCurrent ? 1 : 0),
  );
  return listLessons(planItemId);
}

export function setLessonStatus(id: number, status: Lesson["status"], error = ""): void {
  getDb()
    .prepare("UPDATE lessons SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, id);
}

export function setLessonContent(id: number, content: string, sources: object[] = []): void {
  getDb()
    .prepare(
      "UPDATE lessons SET content = ?, sources = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?",
    )
    .run(content, JSON.stringify(sources), id);
}

/* ── Presentations (AI slide decks) ────────────────────────── */

export type Presentation = {
  id: number;
  goal_id: number | null;
  title: string;
  topic: string;
  content: string;
  status: "generating" | "ready" | "error";
  error: string;
  created_at: string;
  updated_at: string;
};

export function createPresentation(
  userId: number,
  title: string,
  topic: string,
  goalId: number | null = null,
): Presentation {
  const info = getDb()
    .prepare("INSERT INTO presentations (user_id, title, topic, goal_id) VALUES (?, ?, ?, ?)")
    .run(userId, title, topic, goalId);
  return getPresentation(Number(info.lastInsertRowid))!;
}

export function getPresentation(id: number): Presentation | undefined {
  return getDb().prepare("SELECT * FROM presentations WHERE id = ?").get(id) as
    | Presentation
    | undefined;
}

export function listPresentations(userId: number): Presentation[] {
  return getDb()
    .prepare("SELECT * FROM presentations WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as Presentation[];
}

export function setPresentationContent(id: number, title: string, content: string): void {
  getDb()
    .prepare(
      "UPDATE presentations SET title = ?, content = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?",
    )
    .run(title, content, id);
}

export function setPresentationStatus(id: number, status: Presentation["status"], error = ""): void {
  getDb()
    .prepare("UPDATE presentations SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, id);
}

export function deletePresentation(id: number): void {
  getDb().prepare("DELETE FROM presentations WHERE id = ?").run(id);
}

/* ── Books (long-form, chapter-by-chapter) ─────────────────── */

export type Book = {
  id: number;
  title: string;
  brief: string;
  status: "outlining" | "ready" | "error";
  error: string;
  created_at: string;
  updated_at: string;
};

export type Chapter = {
  id: number;
  book_id: number;
  title: string;
  summary: string;
  order_index: number;
  status: "stub" | "queued" | "generating" | "ready" | "error";
  content: string;
  error: string;
  created_at: string;
  updated_at: string;
};

export function createBook(userId: number, title: string, brief: string): Book {
  const info = getDb()
    .prepare("INSERT INTO books (user_id, title, brief) VALUES (?, ?, ?)")
    .run(userId, title, brief);
  return getBook(Number(info.lastInsertRowid))!;
}

export function getBook(id: number): Book | undefined {
  return getDb().prepare("SELECT * FROM books WHERE id = ?").get(id) as Book | undefined;
}

export function listBooks(userId: number): Book[] {
  return getDb()
    .prepare("SELECT * FROM books WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as Book[];
}

export function setBookStatus(id: number, status: Book["status"], error = ""): void {
  getDb()
    .prepare("UPDATE books SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, id);
}

export function deleteBook(id: number): void {
  getDb().prepare("DELETE FROM books WHERE id = ?").run(id);
}

export function createChapterStubs(
  bookId: number,
  stubs: { title: string; summary?: string }[],
): Chapter[] {
  const db = getDb();
  const ins = db.prepare(
    "INSERT INTO chapters (book_id, title, summary, order_index) VALUES (?, ?, ?, ?)",
  );
  stubs.forEach((s, i) => ins.run(bookId, s.title, s.summary ?? "", i));
  return listChapters(bookId);
}

export function listChapters(bookId: number): Chapter[] {
  return getDb()
    .prepare("SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index, id")
    .all(bookId) as Chapter[];
}

export function getChapter(id: number): Chapter | undefined {
  return getDb().prepare("SELECT * FROM chapters WHERE id = ?").get(id) as Chapter | undefined;
}

export function chapterWithBook(id: number): { chapter: Chapter; book: Book } | undefined {
  const chapter = getChapter(id);
  if (!chapter) return undefined;
  const book = getBook(chapter.book_id);
  if (!book) return undefined;
  return { chapter, book };
}

export function setChapterStatus(id: number, status: Chapter["status"], error = ""): void {
  getDb()
    .prepare("UPDATE chapters SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, id);
}

export function setChapterContent(id: number, content: string): void {
  getDb()
    .prepare(
      "UPDATE chapters SET content = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?",
    )
    .run(content, id);
}

/* ── Spaced repetition (assessments / follow-ups) ──────────── */

/** Enroll a lesson in spaced review — due today, fresh SM-2 state. Idempotent. */
export function enrollLesson(id: number): Lesson | undefined {
  getDb()
    .prepare(
      `UPDATE lessons SET srs_due = date('now'), srs_interval = 0, srs_ease = 2.3, srs_reps = 0,
       updated_at = datetime('now') WHERE id = ? AND srs_due IS NULL`,
    )
    .run(id);
  return getLesson(id);
}

export function unenrollLesson(id: number): void {
  getDb().prepare("UPDATE lessons SET srs_due = NULL WHERE id = ?").run(id);
}

const DUE_JOIN = `FROM lessons l
       JOIN plan_items pi ON pi.id = l.plan_item_id
       JOIN plans p ON p.id = pi.plan_id
       JOIN goals g ON g.id = p.goal_id`;

/** Lessons due for review today for this user, soonest first. */
export function dueLessons(userId: number): DueLesson[] {
  return getDb()
    .prepare(
      `SELECT l.*, pi.title AS milestone_title, g.id AS goal_id, g.title AS goal_title
       ${DUE_JOIN}
       WHERE g.user_id = ? AND l.srs_due IS NOT NULL AND date(l.srs_due) <= date('now') AND l.status = 'ready'
       ORDER BY l.srs_due, l.id`,
    )
    .all(userId) as DueLesson[];
}

export function dueCount(userId: number): number {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) c ${DUE_JOIN}
       WHERE g.user_id = ? AND l.srs_due IS NOT NULL AND date(l.srs_due) <= date('now') AND l.status = 'ready'`,
    )
    .get(userId) as { c: number };
  return r.c;
}

export type SrsUpcoming = { enrolled: number; dueToday: number };

export function srsSummary(userId: number): SrsUpcoming {
  const enrolled = (getDb()
    .prepare(`SELECT COUNT(*) c ${DUE_JOIN} WHERE g.user_id = ? AND l.srs_due IS NOT NULL`)
    .get(userId) as { c: number }).c;
  return { enrolled, dueToday: dueCount(userId) };
}

/** Persist a computed SM-2 result and the next due date. */
export function saveReview(
  id: number,
  next: { interval: number; ease: number; reps: number },
): void {
  getDb()
    .prepare(
      `UPDATE lessons SET srs_interval = ?, srs_ease = ?, srs_reps = ?, srs_last = datetime('now'),
       srs_due = date('now', '+' || ? || ' days'), updated_at = datetime('now') WHERE id = ?`,
    )
    .run(next.interval, next.ease, next.reps, Math.max(0, Math.round(next.interval)), id);
}

/* ── Jobs (durable async queue) ────────────────────────────── */

export function enqueueJobRow(type: string, payload: object, userId: number | null = null): Job {
  const info = getDb()
    .prepare("INSERT INTO jobs (type, payload, user_id) VALUES (?, ?, ?)")
    .run(type, JSON.stringify(payload), userId);
  return getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(Number(info.lastInsertRowid)) as Job;
}

/** Atomically claim up to `n` queued jobs (marks them running). */
export function claimJobs(n: number): Job[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT ?")
    .all(n) as Job[];
  const claim = db.prepare(
    "UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ? AND status = 'queued'",
  );
  const claimed: Job[] = [];
  for (const r of rows) {
    const res = claim.run(r.id);
    if (Number(res.changes) > 0) claimed.push({ ...r, status: "running", attempts: r.attempts + 1 });
  }
  return claimed;
}

export function finishJob(id: number, status: "done" | "error", error = ""): void {
  getDb()
    .prepare("UPDATE jobs SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, id);
}

export function requeueJob(id: number, error: string): void {
  getDb()
    .prepare("UPDATE jobs SET status = 'queued', error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(error, id);
}

/** Reset jobs stuck in 'running' (from a crash/restart) back to 'queued', and
 *  reset their lessons off transient states so the worker can retry them. */
export function recoverOrphanedJobs(): void {
  const db = getDb();
  const orphans = db.prepare("SELECT * FROM jobs WHERE status = 'running'").all() as Job[];
  for (const j of orphans) {
    db.prepare("UPDATE jobs SET status = 'queued', updated_at = datetime('now') WHERE id = ?").run(j.id);
    try {
      const { lessonId } = JSON.parse(j.payload) as { lessonId?: number };
      if (lessonId) {
        db.prepare(
          "UPDATE lessons SET status = 'queued', updated_at = datetime('now') WHERE id = ? AND status = 'generating'",
        ).run(lessonId);
      }
    } catch {
      /* ignore */
    }
  }
}

export function countQueuedJobs(): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) c FROM jobs WHERE status IN ('queued','running')")
    .get() as { c: number };
  return r.c;
}
