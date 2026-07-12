import { getDb } from "./db";

export type Goal = {
  id: number;
  title: string;
  description: string;
  status: "active" | "done" | "archived";
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
    .prepare("SELECT * FROM goals WHERE status != 'archived' ORDER BY status='done', updated_at DESC")
    .all() as Goal[];
}

export function getGoal(id: number): Goal | undefined {
  return getDb().prepare("SELECT * FROM goals WHERE id = ?").get(id) as Goal | undefined;
}

export function createGoal(title: string, description = ""): Goal {
  const info = getDb()
    .prepare("INSERT INTO goals (title, description) VALUES (?, ?)")
    .run(title, description);
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
