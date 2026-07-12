import { getDb } from "./db";

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
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: number;
  type: string;
  payload: string;
  status: "queued" | "running" | "done" | "error";
  attempts: number;
  error: string;
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

export function listGoals(): Goal[] {
  return getDb()
    .prepare(
      "SELECT * FROM goals WHERE status != 'archived' AND parent_goal_id IS NULL ORDER BY status='done', updated_at DESC",
    )
    .all() as Goal[];
}

export function getGoal(id: number): Goal | undefined {
  return getDb().prepare("SELECT * FROM goals WHERE id = ?").get(id) as Goal | undefined;
}

export function getChildGoals(parentId: number): Goal[] {
  return getDb()
    .prepare("SELECT * FROM goals WHERE parent_goal_id = ? AND status != 'archived' ORDER BY id")
    .all(parentId) as Goal[];
}

export function createGoal(title: string, description = "", parentGoalId: number | null = null): Goal {
  const info = getDb()
    .prepare("INSERT INTO goals (title, description, parent_goal_id) VALUES (?, ?, ?)")
    .run(title, description, parentGoalId);
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

export function listSessions(limit = 100): (Session & { goal_title: string | null })[] {
  return getDb()
    .prepare(
      `SELECT s.*, g.title AS goal_title
       FROM sessions s LEFT JOIN goals g ON g.id = s.goal_id
       ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .all(limit) as (Session & { goal_title: string | null })[];
}

export function createSession(input: {
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
      `INSERT INTO sessions (goal_id, mode, duration_sec, notes, tags, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
    )
    .run(
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

export function sessionStats(): SessionStats {
  const db = getDb();
  const total = db
    .prepare("SELECT COALESCE(SUM(duration_sec),0) n, COUNT(*) c FROM sessions WHERE mode='focus'")
    .get() as { n: number; c: number };
  const today = db
    .prepare(
      "SELECT COALESCE(SUM(duration_sec),0) n FROM sessions WHERE mode='focus' AND date(created_at)=date('now')",
    )
    .get() as { n: number };
  return { totalFocusSec: total.n, sessionCount: total.c, todayFocusSec: today.n };
}

/* ── Threads & messages (coach) ────────────────────────── */

export function getOrCreateDefaultThread(goalId?: number | null): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM threads ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO threads (goal_id) VALUES (?)").run(goalId ?? null);
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

/* ── Jobs (durable async queue) ────────────────────────────── */

export function enqueueJobRow(type: string, payload: object): Job {
  const info = getDb()
    .prepare("INSERT INTO jobs (type, payload) VALUES (?, ?)")
    .run(type, JSON.stringify(payload));
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
