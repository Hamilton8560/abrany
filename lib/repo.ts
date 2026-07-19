import { randomBytes } from "node:crypto";
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
  language: string; // ISO-ish short code (see lib/languages); '' → default 'en'
  name: string; // display name for certificates ('' → derive from email)
  must_reset_password: number; // 1 = issued a temp password; must set their own before using the app
  notify_certificates: number; // 1 = email when a certificate is earned
  notify_weekly_report: number; // 1 = weekly progress digest email
  last_weekly_email_at: string | null;
  created_at: string;
};

/** Best display name for a user: their set name, else the email's local part. */
export function displayName(u: Pick<User, "name" | "email">): string {
  if (u.name && u.name.trim()) return u.name.trim();
  const local = u.email.split("@")[0].replace(/[._-]+/g, " ");
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export function setUserLanguage(id: number, language: string): void {
  getDb().prepare("UPDATE users SET language = ? WHERE id = ?").run(language, id);
}

export function setUserName(id: number, name: string): void {
  getDb().prepare("UPDATE users SET name = ? WHERE id = ?").run(name.slice(0, 80), id);
}

export function setMustResetPassword(id: number, must: boolean): void {
  getDb().prepare("UPDATE users SET must_reset_password = ? WHERE id = ?").run(must ? 1 : 0, id);
}

export function setNotificationPrefs(
  id: number,
  prefs: { certificates?: boolean; weeklyReport?: boolean },
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (prefs.certificates !== undefined) { sets.push("notify_certificates = ?"); vals.push(prefs.certificates ? 1 : 0); }
  if (prefs.weeklyReport !== undefined) { sets.push("notify_weekly_report = ?"); vals.push(prefs.weeklyReport ? 1 : 0); }
  if (sets.length) getDb().prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]), id);
}

/** Users due for their weekly progress email (opted in, never sent or 7+ days ago). */
export function usersDueWeeklyReport(): Pick<User, "id" | "email" | "name" | "language">[] {
  return getDb()
    .prepare(
      `SELECT id, email, name, language FROM users
       WHERE notify_weekly_report = 1
         AND (last_weekly_email_at IS NULL OR last_weekly_email_at <= datetime('now', '-7 days'))`,
    )
    .all() as Pick<User, "id" | "email" | "name" | "language">[];
}

export function markWeeklyReportSent(id: number): void {
  getDb().prepare("UPDATE users SET last_weekly_email_at = datetime('now') WHERE id = ?").run(id);
}

/** A user's training in the last 7 days, for the weekly digest. */
export function weeklyDigest(userId: number): {
  focusSec: number;
  sessionCount: number;
  sectionsCompleted: number;
  certificatesEarned: number;
} {
  const db = getDb();
  const focus = db
    .prepare(
      "SELECT COALESCE(SUM(duration_sec),0) sec, COUNT(*) n FROM sessions WHERE user_id = ? AND mode='focus' AND created_at >= datetime('now','-7 days')",
    )
    .get(userId) as { sec: number; n: number };
  const sections = db
    .prepare(
      `SELECT COUNT(*) n FROM lessons l
       JOIN plan_items pi ON pi.id = l.plan_item_id JOIN plans p ON p.id = pi.plan_id JOIN goals g ON g.id = p.goal_id
       WHERE g.user_id = ? AND l.completed_at >= datetime('now','-7 days')`,
    )
    .get(userId) as { n: number };
  const certs = db
    .prepare("SELECT COUNT(*) n FROM certificates WHERE user_id = ? AND issued_at >= datetime('now','-7 days')")
    .get(userId) as { n: number };
  return { focusSec: focus.sec, sessionCount: focus.n, sectionsCompleted: sections.n, certificatesEarned: certs.n };
}

/* ── focus timer (server-synced, one per user) ─────────────── */

export type TimerState = {
  mode: "focus" | "break";
  focus_min: number;
  break_min: number;
  running: number; // 0/1
  end_at: number | null;
  left_sec: number;
  focus_accum: number;
  focus_start: number | null;
  book_id: number | null; // reading target for a focus block (→ Temporal on completion)
  chapter_id: number | null;
  updated_at: string;
};

const DEFAULT_TIMER: TimerState = {
  mode: "focus",
  focus_min: 25,
  break_min: 5,
  running: 0,
  end_at: null,
  left_sec: 25 * 60,
  focus_accum: 0,
  focus_start: null,
  book_id: null,
  chapter_id: null,
  updated_at: "",
};

export function getTimerState(userId: number): TimerState {
  const row = getDb().prepare("SELECT * FROM timer_states WHERE user_id = ?").get(userId) as
    | (TimerState & { user_id: number })
    | undefined;
  return row ? row : { ...DEFAULT_TIMER };
}

export function setTimerState(userId: number, s: Omit<TimerState, "updated_at">): TimerState {
  getDb()
    .prepare(
      `INSERT INTO timer_states (user_id, mode, focus_min, break_min, running, end_at, left_sec, focus_accum, focus_start, book_id, chapter_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         mode=excluded.mode, focus_min=excluded.focus_min, break_min=excluded.break_min,
         running=excluded.running, end_at=excluded.end_at, left_sec=excluded.left_sec,
         focus_accum=excluded.focus_accum, focus_start=excluded.focus_start,
         book_id=excluded.book_id, chapter_id=excluded.chapter_id, updated_at=datetime('now')`,
    )
    .run(
      userId,
      s.mode,
      s.focus_min,
      s.break_min,
      s.running ? 1 : 0,
      s.end_at,
      s.left_sec,
      s.focus_accum,
      s.focus_start,
      s.book_id ?? null,
      s.chapter_id ?? null,
    );
  return getTimerState(userId);
}

/**
 * If the user's running timer has passed its deadline, finalize it exactly
 * once: log a session for a completed FOCUS block (reading if a book is
 * attached → Temporal, else focus → Prefrontal) and reset the row. Idempotent
 * and atomic-by-single-row — whichever device/request calls it first logs the
 * session; later calls see running=0 and do nothing. This is what prevents
 * duplicate logging across a user's open devices.
 */
export function finalizeTimerIfDue(userId: number): { timer: TimerState; justCompleted: boolean } {
  const t = getTimerState(userId);
  const due = t.running && t.end_at != null && t.end_at <= Date.now();
  if (!due) return { timer: t, justCompleted: false };

  // breaks are rest, not training — they complete but log nothing
  if (t.mode !== "break") {
    createSession({
      userId,
      mode: t.book_id ? "reading" : "focus",
      durationSec: t.focus_min * 60,
      bookId: t.book_id,
      chapterId: t.chapter_id,
    });
  }
  // reset to an acknowledged-complete state (left_sec=0 marks "done")
  const timer = setTimerState(userId, {
    ...t,
    running: 0,
    end_at: null,
    left_sec: 0,
    focus_accum: 0,
    focus_start: null,
    book_id: null,
    chapter_id: null,
  });
  return { timer, justCompleted: true };
}

/** minimum elapsed time (seconds) an abandoned block must have to be worth logging */
const MIN_LOGGABLE_SEC = 60;

/**
 * Stop the timer early. If a focus/reading block was in progress, log the time
 * actually elapsed (when it clears MIN_LOGGABLE_SEC) so a stopped-short session
 * still counts, then reset to idle. Breaks and trivially-short blocks log
 * nothing. The elapsed time is computed server-side (not client-supplied).
 */
export function stopTimer(userId: number): { timer: TimerState; logged: boolean } {
  const t = getTimerState(userId);
  const fullSec = t.focus_min * 60;
  let elapsedSec = 0;
  if (t.running && t.end_at != null) {
    const remaining = Math.max(0, Math.round((t.end_at - Date.now()) / 1000));
    elapsedSec = Math.max(0, fullSec - remaining);
  } else if (!t.running && t.left_sec > 0 && t.left_sec < fullSec) {
    // paused mid-block
    elapsedSec = fullSec - t.left_sec;
  }

  let logged = false;
  if (t.mode !== "break" && elapsedSec >= MIN_LOGGABLE_SEC) {
    createSession({
      userId,
      mode: t.book_id ? "reading" : "focus",
      durationSec: elapsedSec,
      bookId: t.book_id,
      chapterId: t.chapter_id,
    });
    logged = true;
  }

  const timer = setTimerState(userId, {
    ...t,
    mode: "focus",
    running: 0,
    end_at: null,
    left_sec: t.focus_min * 60,
    focus_accum: 0,
    focus_start: null,
    book_id: null,
    chapter_id: null,
  });
  return { timer, logged };
}

/** All users (owner-only use: the impersonation / instructor picker). */
export function listUsers(): Pick<User, "id" | "email" | "is_owner" | "language" | "created_at">[] {
  return getDb()
    .prepare("SELECT id, email, is_owner, language, created_at FROM users ORDER BY is_owner DESC, email")
    .all() as Pick<User, "id" | "email" | "is_owner" | "language" | "created_at">[];
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
  completed_at: string | null; // null = not yet read/marked done
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
  version: number; // 1 = legacy, 2 = outcome-based (intake, hours, difficulty)
  intake: string; // JSON snapshot of the V2 intake ('' on legacy plans)
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
  outcomes: string; // JSON array of measurable "you can …" statements ('[]' on v1)
  hours: number; // estimated hours (0 on v1)
  difficulty: string; // intro|core|advanced ('' on v1)
};

/** A milestone plus how many of its lessons exist / are completed (for progress). */
export type PlanItemWithProgress = PlanItem & {
  lessons_total: number;
  lessons_done: number;
};

export type Session = {
  id: number;
  goal_id: number | null;
  mode: "focus" | "break" | "reading";
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  notes: string;
  tags: string;
  book_id: number | null;
  chapter_id: number | null;
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
export function getPlanForGoal(goalId: number): (Plan & { items: PlanItemWithProgress[] }) | undefined {
  const plan = getDb()
    .prepare("SELECT * FROM plans WHERE goal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(goalId) as Plan | undefined;
  if (!plan) return undefined;
  const items = getDb()
    .prepare(
      `SELECT pi.*,
         (SELECT COUNT(*) FROM lessons l WHERE l.plan_item_id = pi.id) AS lessons_total,
         (SELECT COUNT(*) FROM lessons l WHERE l.plan_item_id = pi.id AND l.completed_at IS NOT NULL) AS lessons_done
       FROM plan_items pi WHERE pi.plan_id = ? ORDER BY pi.order_index, pi.id`,
    )
    .all(plan.id) as PlanItemWithProgress[];
  return { ...plan, items };
}

export function createPlan(
  goalId: number,
  title: string,
  summary: string,
  items: {
    title: string;
    detail?: string;
    estimate?: string;
    outcomes?: string[];
    hours?: number;
    difficulty?: string;
  }[],
  opts: { version?: number; intake?: object } = {},
): Plan & { items: PlanItem[] } {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO plans (goal_id, title, summary, version, intake) VALUES (?, ?, ?, ?, ?)")
    .run(goalId, title, summary, opts.version ?? 1, opts.intake ? JSON.stringify(opts.intake) : "");
  const planId = Number(info.lastInsertRowid);
  const insItem = db.prepare(
    "INSERT INTO plan_items (plan_id, title, detail, estimate, order_index, outcomes, hours, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  items.forEach((it, i) =>
    insItem.run(
      planId,
      it.title,
      it.detail ?? "",
      it.estimate ?? "",
      i,
      JSON.stringify(it.outcomes ?? []),
      it.hours ?? 0,
      it.difficulty ?? "",
    ),
  );
  return getPlanForGoal(goalId)!;
}

export function updatePlanItem(itemId: number, status: PlanItem["status"]): void {
  getDb().prepare("UPDATE plan_items SET status = ? WHERE id = ?").run(status, itemId);
}

/* ── course editing (structural + textual, content untouched) ── */

export function getPlanItem(id: number): PlanItem | undefined {
  return getDb().prepare("SELECT * FROM plan_items WHERE id = ?").get(id) as PlanItem | undefined;
}

export function updatePlanItemFields(
  id: number,
  fields: Partial<Pick<PlanItem, "title" | "detail" | "estimate">>,
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.title !== undefined && fields.title.trim()) { sets.push("title = ?"); vals.push(fields.title.trim().slice(0, 160)); }
  if (fields.detail !== undefined) { sets.push("detail = ?"); vals.push(fields.detail.slice(0, 400)); }
  if (fields.estimate !== undefined) { sets.push("estimate = ?"); vals.push(fields.estimate.slice(0, 40)); }
  if (sets.length) getDb().prepare(`UPDATE plan_items SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]), id);
}

export function deletePlanItem(id: number): void {
  getDb().prepare("DELETE FROM plan_items WHERE id = ?").run(id);
}

/** Move a milestone one slot up or down (swaps order_index with its neighbor). */
export function movePlanItem(id: number, dir: "up" | "down"): void {
  const db = getDb();
  const item = getPlanItem(id);
  if (!item) return;
  const neighbor = db
    .prepare(
      `SELECT * FROM plan_items WHERE plan_id = ? AND order_index ${dir === "up" ? "<" : ">"} ?
       ORDER BY order_index ${dir === "up" ? "DESC" : "ASC"} LIMIT 1`,
    )
    .get(item.plan_id, item.order_index) as PlanItem | undefined;
  if (!neighbor) return;
  db.prepare("UPDATE plan_items SET order_index = ? WHERE id = ?").run(neighbor.order_index, item.id);
  db.prepare("UPDATE plan_items SET order_index = ? WHERE id = ?").run(item.order_index, neighbor.id);
}

/** Append a new milestone to a goal's latest plan. */
export function addPlanItem(planId: number, title: string, detail = ""): PlanItem {
  const db = getDb();
  const max = db.prepare("SELECT COALESCE(MAX(order_index), -1) m FROM plan_items WHERE plan_id = ?").get(planId) as { m: number };
  const info = db
    .prepare("INSERT INTO plan_items (plan_id, title, detail, order_index) VALUES (?, ?, ?, ?)")
    .run(planId, title.trim().slice(0, 160), detail.slice(0, 400), max.m + 1);
  return getPlanItem(Number(info.lastInsertRowid))!;
}

export function updateLessonFields(
  id: number,
  fields: Partial<Pick<Lesson, "title" | "objective">>,
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.title !== undefined && fields.title.trim()) { sets.push("title = ?"); vals.push(fields.title.trim().slice(0, 160)); }
  if (fields.objective !== undefined) { sets.push("objective = ?"); vals.push(fields.objective.slice(0, 300)); }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    getDb().prepare(`UPDATE lessons SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]), id);
  }
}

export function deleteLesson(id: number): void {
  getDb().prepare("DELETE FROM lessons WHERE id = ?").run(id);
}

/* ── Sessions ──────────────────────────────────────────── */

export type SessionRow = Session & {
  goal_title: string | null;
  book_title: string | null;
  chapter_title: string | null;
};

export function listSessions(userId: number, limit = 100): SessionRow[] {
  return getDb()
    .prepare(
      `SELECT s.*, g.title AS goal_title, b.title AS book_title, c.title AS chapter_title
       FROM sessions s
       LEFT JOIN goals g ON g.id = s.goal_id
       LEFT JOIN books b ON b.id = s.book_id
       LEFT JOIN chapters c ON c.id = s.chapter_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .all(userId, limit) as SessionRow[];
}

export function createSession(input: {
  userId: number;
  goalId?: number | null;
  mode?: "focus" | "break" | "reading";
  durationSec: number;
  notes?: string;
  tags?: string;
  bookId?: number | null;
  chapterId?: number | null;
  startedAt?: string;
  endedAt?: string;
}): Session {
  const info = getDb()
    .prepare(
      `INSERT INTO sessions (user_id, goal_id, mode, duration_sec, notes, tags, book_id, chapter_id, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
    )
    .run(
      input.userId,
      input.goalId ?? null,
      input.mode ?? "focus",
      Math.round(input.durationSec),
      input.notes ?? "",
      input.tags ?? "",
      input.bookId ?? null,
      input.chapterId ?? null,
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

export type LessonSection = { title: string; objective: string; content: string };

/** All ready lesson content for a whole goal, in order (source material for guides/tutor). */
export function goalReadySections(goalId: number): LessonSection[] {
  return getDb()
    .prepare(
      `SELECT l.title, l.objective, l.content FROM lessons l
       JOIN plan_items pi ON pi.id = l.plan_item_id JOIN plans p ON p.id = pi.plan_id
       WHERE p.goal_id = ? AND l.status = 'ready' ORDER BY pi.order_index, l.order_index`,
    )
    .all(goalId) as LessonSection[];
}

/** All ready lesson content for one milestone, in order. */
export function milestoneReadySections(planItemId: number): LessonSection[] {
  return getDb()
    .prepare(
      "SELECT title, objective, content FROM lessons WHERE plan_item_id = ? AND status = 'ready' ORDER BY order_index",
    )
    .all(planItemId) as LessonSection[];
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

/** Mark a lesson (small section) read/done, or clear it. Returns the updated row. */
export function setLessonCompleted(id: number, done: boolean): Lesson | undefined {
  getDb()
    .prepare("UPDATE lessons SET completed_at = ?, updated_at = datetime('now') WHERE id = ?")
    .run(done ? new Date().toISOString() : null, id);
  return getLesson(id);
}

/** Store a section's grade (e.g. "A", "92%") for the transcript. */
export function setLessonGrade(id: number, grade: string): void {
  getDb().prepare("UPDATE lessons SET grade = ? WHERE id = ?").run(grade.slice(0, 12), id);
}

/* ── Certificates / credentials ────────────────────────────── */

export type Certificate = {
  id: string;
  user_id: number;
  goal_id: number | null;
  recipient_name: string;
  title: string;
  sections_total: number;
  sections_done: number;
  minutes_total: number;
  overall: string;
  issued_at: string;
  /** White-label snapshot: set when the goal was assigned by an organization. */
  org_id: number | null;
  org_name: string;
  org_logo: string;
};

export type TranscriptRow = { title: string; kind: string; completed_at: string | null; grade: string };

/** Roll a goal's lessons + time up into transcript stats. */
export function goalStats(goalId: number): {
  sectionsTotal: number;
  sectionsDone: number;
  minutesTotal: number;
  rows: TranscriptRow[];
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.title, l.kind, l.completed_at, l.grade
         FROM lessons l
         JOIN plan_items pi ON pi.id = l.plan_item_id
         JOIN plans p ON p.id = pi.plan_id
        WHERE p.goal_id = ?
        ORDER BY pi.order_index, l.order_index`,
    )
    .all(goalId) as TranscriptRow[];
  const sectionsTotal = rows.length;
  const sectionsDone = rows.filter((r) => r.completed_at).length;
  const secs = db
    .prepare("SELECT COALESCE(SUM(duration_sec),0) n FROM sessions WHERE goal_id = ? AND mode='focus'")
    .get(goalId) as { n: number };
  return { sectionsTotal, sectionsDone, minutesTotal: Math.round(secs.n / 60), rows };
}

/** Derive an overall label from the graded sections (else a completion label). */
function overallLabel(rows: TranscriptRow[], sectionsTotal: number, sectionsDone: number): string {
  const graded = rows.map((r) => r.grade).filter(Boolean);
  const letters = graded.filter((g) => /^[A-F][+-]?$/.test(g));
  if (letters.length) {
    const pts = letters.map((g) => "FDCBA".indexOf(g[0]) + (g[1] === "+" ? 0.3 : g[1] === "-" ? -0.3 : 0));
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    const base = "FDCBA"[Math.max(0, Math.min(4, Math.round(avg)))];
    const frac = avg - Math.round(avg);
    return base + (frac > 0.15 ? "+" : frac < -0.15 ? "−" : "");
  }
  return sectionsTotal > 0 && sectionsDone >= sectionsTotal ? "Completed" : "In progress";
}

/** Map a 0-100 score to a letter grade (shared by exams + certificate). */
export function scoreToLetter(pct: number): string {
  return pct >= 93 ? "A" : pct >= 85 ? "A−" : pct >= 78 ? "B+" : pct >= 70 ? "B" : pct >= 60 ? "C+" : pct >= 50 ? "C" : "D";
}

/** Issue (or return the existing) credential for a completed goal. */
export function issueCertificate(userId: number, goalId: number): Certificate {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM certificates WHERE user_id = ? AND goal_id = ? ORDER BY issued_at DESC LIMIT 1")
    .get(userId, goalId) as Certificate | undefined;
  if (existing) return existing;

  const goal = getGoal(goalId)!;
  const user = getUser(userId)!;
  const stats = goalStats(goalId);
  const year = new Date().getFullYear();
  const id = `ABR-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
  // prefer the final-exam grade as the headline result; else fall back to sections
  const finalExam = db.prepare("SELECT best_score, passed FROM exams WHERE goal_id = ? AND kind = 'final'").get(goalId) as
    | { best_score: number; passed: number }
    | undefined;
  const overall =
    finalExam && finalExam.passed
      ? scoreToLetter(finalExam.best_score)
      : overallLabel(stats.rows, stats.sectionsTotal, stats.sectionsDone);
  // white-label: org-assigned training issues under the company's brand
  const org = db
    .prepare(
      "SELECT o.id, o.name, o.logo FROM assignments a JOIN orgs o ON o.id = a.org_id WHERE a.goal_id = ? ORDER BY a.id LIMIT 1",
    )
    .get(goalId) as { id: number; name: string; logo: string } | undefined;
  db.prepare(
    `INSERT INTO certificates (id, user_id, goal_id, recipient_name, title, sections_total, sections_done, minutes_total, overall, org_id, org_name, org_logo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    goalId,
    displayName(user),
    goal.title,
    stats.sectionsTotal,
    stats.sectionsDone,
    stats.minutesTotal,
    overall,
    org?.id ?? null,
    org?.name ?? "",
    org?.logo ?? "",
  );
  return db.prepare("SELECT * FROM certificates WHERE id = ?").get(id) as Certificate;
}

export function getCertificate(id: string): Certificate | undefined {
  return getDb().prepare("SELECT * FROM certificates WHERE id = ?").get(id) as Certificate | undefined;
}

export function getCertificateForGoal(userId: number, goalId: number): Certificate | undefined {
  return getDb()
    .prepare("SELECT * FROM certificates WHERE user_id = ? AND goal_id = ? ORDER BY issued_at DESC LIMIT 1")
    .get(userId, goalId) as Certificate | undefined;
}

export function listCertificates(userId: number): Certificate[] {
  return getDb()
    .prepare("SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC")
    .all(userId) as Certificate[];
}

/* ── Exams (midterm + final; gate the certificate) ─────────── */

export type ExamKind = "midterm" | "final";
export type Exam = {
  id: number;
  goal_id: number;
  kind: ExamKind;
  title: string;
  study_guide: string;
  status: "stub" | "generating" | "ready" | "error";
  best_score: number;
  passed: number;
  attempts: number;
  error: string;
  created_at: string;
  updated_at: string;
};

export const PASS_SCORE = 70;

export function examsForGoal(goalId: number): Exam[] {
  return getDb()
    .prepare("SELECT * FROM exams WHERE goal_id = ? ORDER BY CASE kind WHEN 'midterm' THEN 0 ELSE 1 END")
    .all(goalId) as Exam[];
}

/** Create the midterm (if the course is big enough) + final for a planned goal. */
export function ensureExams(goalId: number): Exam[] {
  const plan = getPlanForGoal(goalId);
  if (!plan || plan.items.length === 0) return examsForGoal(goalId);
  const goal = getGoal(goalId);
  const db = getDb();
  const mk = (kind: ExamKind, title: string) =>
    db.prepare("INSERT OR IGNORE INTO exams (goal_id, kind, title) VALUES (?, ?, ?)").run(goalId, kind, title);
  if (plan.items.length >= 4) mk("midterm", `Midterm — ${goal?.title ?? "Course"}`);
  mk("final", `Final exam — ${goal?.title ?? "Course"}`);
  return examsForGoal(goalId);
}

export function getExam(id: number): Exam | undefined {
  return getDb().prepare("SELECT * FROM exams WHERE id = ?").get(id) as Exam | undefined;
}

export const userOwnsExam = (userId: number, examId: number) =>
  owns(
    "SELECT 1 FROM exams e JOIN goals g ON g.id = e.goal_id WHERE e.id = ? AND g.user_id = ?",
    examId,
    userId,
  );

/** The section content an exam covers — midterm = first half of milestones, final = all. */
export function examScope(exam: Exam): { title: string; objective: string; content: string }[] {
  const plan = getPlanForGoal(exam.goal_id);
  if (!plan || !plan.items.length) return [];
  const items = exam.kind === "midterm" ? plan.items.slice(0, Math.ceil(plan.items.length / 2)) : plan.items;
  const ids = items.map((i) => i.id);
  if (!ids.length) return [];
  return getDb()
    .prepare(
      `SELECT title, objective, content FROM lessons
        WHERE plan_item_id IN (${ids.map(() => "?").join(",")}) AND status = 'ready'
        ORDER BY plan_item_id, order_index`,
    )
    .all(...ids) as { title: string; objective: string; content: string }[];
}

export function setExamStatus(id: number, status: Exam["status"], error = ""): void {
  getDb().prepare("UPDATE exams SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?").run(status, error, id);
}

export function setExamStudyGuide(id: number, studyGuide: string): void {
  getDb()
    .prepare("UPDATE exams SET study_guide = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?")
    .run(studyGuide, id);
}

/** Record an attempt; keep the best score; latch 'passed' once earned. */
export function recordExamAttempt(id: number, score: number): Exam | undefined {
  const e = getExam(id);
  if (!e) return undefined;
  const best = Math.max(e.best_score, score);
  const passed = e.passed || score >= PASS_SCORE ? 1 : 0;
  getDb()
    .prepare("UPDATE exams SET attempts = attempts + 1, best_score = ?, passed = ?, updated_at = datetime('now') WHERE id = ?")
    .run(best, passed, id);
  return getExam(id);
}

export function finalPassed(goalId: number): boolean {
  const r = getDb().prepare("SELECT passed FROM exams WHERE goal_id = ? AND kind = 'final'").get(goalId) as
    | { passed: number }
    | undefined;
  return !!r && r.passed === 1;
}

export function setLessonContent(id: number, content: string, sources: object[] = []): void {
  getDb()
    .prepare(
      "UPDATE lessons SET content = ?, sources = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?",
    )
    .run(content, JSON.stringify(sources), id);
}

/* ── Study guides (first-class, generated on demand) ───────── */

export type StudyGuide = {
  id: number;
  user_id: number;
  goal_id: number | null;
  plan_item_id: number | null;
  title: string;
  topic: string;
  source: "goal" | "milestone" | "topic" | "exam";
  content: string;
  status: "generating" | "ready" | "error";
  error: string;
  created_at: string;
  updated_at: string;
};

export function createStudyGuide(input: {
  userId: number;
  title: string;
  topic?: string;
  goalId?: number | null;
  planItemId?: number | null;
  source?: StudyGuide["source"];
  content?: string; // when provided (e.g. saved from an exam), stored ready
}): StudyGuide {
  const ready = input.content != null && input.content.trim().length > 0;
  const info = getDb()
    .prepare(
      `INSERT INTO study_guides (user_id, goal_id, plan_item_id, title, topic, source, content, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.goalId ?? null,
      input.planItemId ?? null,
      input.title.slice(0, 160),
      (input.topic ?? "").slice(0, 400),
      input.source ?? "topic",
      ready ? input.content! : "",
      ready ? "ready" : "generating",
    );
  return getStudyGuide(Number(info.lastInsertRowid))!;
}

export function getStudyGuide(id: number): StudyGuide | undefined {
  return getDb().prepare("SELECT * FROM study_guides WHERE id = ?").get(id) as StudyGuide | undefined;
}

export function listStudyGuides(userId: number): StudyGuide[] {
  return getDb()
    .prepare("SELECT * FROM study_guides WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as StudyGuide[];
}

export const userOwnsStudyGuide = (userId: number, id: number) =>
  owns("SELECT 1 FROM study_guides WHERE id = ? AND user_id = ?", id, userId);

export function setStudyGuideContent(id: number, title: string, content: string): void {
  getDb()
    .prepare(
      "UPDATE study_guides SET title = ?, content = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?",
    )
    .run(title.slice(0, 160), content, id);
}

export function setStudyGuideStatus(id: number, status: StudyGuide["status"], error = ""): void {
  getDb()
    .prepare("UPDATE study_guides SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error, id);
}

export function deleteStudyGuide(id: number): void {
  getDb().prepare("DELETE FROM study_guides WHERE id = ?").run(id);
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

/** The active (queued or running) job for a dedup key, if one exists. */
export function findActiveJob(dedupKey: string): Job | undefined {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE dedup_key = ? AND status IN ('queued','running') ORDER BY id LIMIT 1")
    .get(dedupKey) as Job | undefined;
}

/** The most recent job for a dedup key regardless of status (for status/error UI). */
export function latestJobByDedup(dedupKey: string): Job | undefined {
  return getDb()
    .prepare("SELECT * FROM jobs WHERE dedup_key = ? ORDER BY id DESC LIMIT 1")
    .get(dedupKey) as Job | undefined;
}

export function enqueueJobRow(
  type: string,
  payload: object,
  userId: number | null = null,
  dedupKey: string | null = null,
): Job {
  const db = getDb();
  // Reuse an in-flight job for the same target rather than duplicating work.
  if (dedupKey) {
    const existing = findActiveJob(dedupKey);
    if (existing) return existing;
  }
  try {
    const info = db
      .prepare("INSERT INTO jobs (type, payload, user_id, dedup_key) VALUES (?, ?, ?, ?)")
      .run(type, JSON.stringify(payload), userId, dedupKey);
    return db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(info.lastInsertRowid)) as Job;
  } catch (err) {
    // Lost a race to the partial-unique index — return the winner's job.
    if (dedupKey) {
      const existing = findActiveJob(dedupKey);
      if (existing) return existing;
    }
    throw err;
  }
}

/** Durable backlog for queue-position UI: pending/running jobs, plus how many
 *  queued jobs sit ahead of this user's oldest pending job. */
export function jobBacklog(userId?: number): { pending: number; running: number; ahead: number } {
  const db = getDb();
  const pending = Number(
    (db.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'queued'").get() as { n: number }).n,
  );
  const running = Number(
    (db.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'running'").get() as { n: number }).n,
  );
  let ahead = 0;
  if (userId) {
    const mine = db
      .prepare("SELECT MIN(id) id FROM jobs WHERE status = 'queued' AND user_id = ?")
      .get(userId) as { id: number | null };
    if (mine?.id != null) {
      ahead = Number(
        (db.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'queued' AND id < ?").get(mine.id) as {
          n: number;
        }).n,
      );
    }
  }
  return { pending, running, ahead };
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
