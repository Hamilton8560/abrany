import { getDb } from "./db";
import {
  listGoals,
  goalStats,
  finalPassed,
  dueCount,
  getUser,
  displayName,
} from "./repo";
import { languageName } from "./languages";

/**
 * Learner memory — what personalizes the tutor across sessions. Two parts:
 *  1. DURABLE memories the tutor (or the user) records about the person —
 *     their goals, preferences, and what trips them up.
 *  2. DERIVED signals rolled up live from what Abrany already tracks —
 *     mastery per goal, weak/stale topics, effort and recency.
 * learnerProfile() folds both into a compact digest injected into the coach so
 * every conversation is grounded in the actual learner, not a blank slate.
 */

export type MemoryCategory = "preference" | "goal" | "struggle" | "context";
export type Memory = {
  id: number;
  user_id: number;
  category: MemoryCategory;
  text: string;
  source: "tutor" | "user";
  created_at: string;
};

const CATEGORIES: MemoryCategory[] = ["preference", "goal", "struggle", "context"];

export function addMemory(
  userId: number,
  text: string,
  category: MemoryCategory = "context",
  source: "tutor" | "user" = "tutor",
): Memory | undefined {
  const clean = text.trim().slice(0, 400);
  if (!clean) return undefined;
  // de-dupe near-identical memories (case-insensitive exact match)
  const existing = getDb()
    .prepare("SELECT id FROM user_memories WHERE user_id = ? AND lower(text) = lower(?)")
    .get(userId, clean) as { id: number } | undefined;
  if (existing) return getMemory(existing.id);
  const cat = CATEGORIES.includes(category) ? category : "context";
  const info = getDb()
    .prepare("INSERT INTO user_memories (user_id, category, text, source) VALUES (?, ?, ?, ?)")
    .run(userId, cat, clean, source === "user" ? "user" : "tutor");
  return getMemory(Number(info.lastInsertRowid));
}

export function getMemory(id: number): Memory | undefined {
  return getDb().prepare("SELECT * FROM user_memories WHERE id = ?").get(id) as Memory | undefined;
}

export function listMemories(userId: number): Memory[] {
  return getDb()
    .prepare("SELECT * FROM user_memories WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as Memory[];
}

export function deleteMemory(userId: number, id: number): void {
  getDb().prepare("DELETE FROM user_memories WHERE id = ? AND user_id = ?").run(id, userId);
}

const fmtAgo = (iso: string | null): string => {
  if (!iso) return "not yet";
  const d = new Date(iso.replace(" ", "T") + "Z").getTime();
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

/** A compact, prompt-ready portrait of the learner + the raw memories for the UI. */
export function learnerProfile(userId: number): { digest: string; memories: Memory[] } {
  const db = getDb();
  const user = getUser(userId);
  const memories = listMemories(userId);
  const lines: string[] = [];

  if (user) {
    lines.push(
      `The learner is ${displayName(user)}${
        user.language && user.language !== "en" ? `, learning in ${languageName(user.language)}` : ""
      }.`,
    );
  }

  // active goals + mastery
  const goals = listGoals(userId).slice(0, 5);
  if (goals.length) {
    lines.push("Active goals & progress:");
    for (const g of goals) {
      const s = goalStats(g.id);
      const exam = db
        .prepare("SELECT best_score, passed FROM exams WHERE goal_id = ? AND kind = 'final'")
        .get(g.id) as { best_score: number; passed: number } | undefined;
      const bits = [`${s.sectionsDone}/${s.sectionsTotal} sections`];
      if (exam?.passed) bits.push(`final passed (${exam.best_score}%)`);
      else if (finalPassed(g.id)) bits.push("completed");
      lines.push(`- ${g.title}: ${bits.join(", ")}`);
    }
  }

  // weak / stale topics from spaced-repetition state
  const weak = db
    .prepare(
      `SELECT l.title FROM lessons l
         JOIN plan_items pi ON pi.id = l.plan_item_id
         JOIN plans p ON p.id = pi.plan_id
         JOIN goals g ON g.id = p.goal_id
        WHERE g.user_id = ? AND l.status = 'ready' AND l.srs_due IS NOT NULL
          AND (l.srs_ease < 2.1 OR date(l.srs_due) < date('now'))
        ORDER BY (date(l.srs_due) < date('now')) DESC, l.srs_ease ASC LIMIT 6`,
    )
    .all(userId) as { title: string }[];
  if (weak.length) lines.push(`Shaky or due for review: ${weak.map((w) => w.title).join("; ")}.`);
  const due = dueCount(userId);
  if (due > 0) lines.push(`${due} spaced-review${due === 1 ? "" : "s"} due today.`);

  // effort & recency
  const eff = db
    .prepare(
      `SELECT MAX(created_at) last,
              COALESCE(SUM(CASE WHEN created_at >= date('now','-7 days') THEN duration_sec ELSE 0 END),0) week
         FROM sessions WHERE user_id = ? AND mode = 'focus'`,
    )
    .get(userId) as { last: string | null; week: number };
  const weekMin = Math.round(eff.week / 60);
  lines.push(
    weekMin > 0
      ? `Focus this week: ${weekMin} min; last studied ${fmtAgo(eff.last)}.`
      : `Hasn't logged focus time in the last week (last studied ${fmtAgo(eff.last)}).`,
  );

  // durable memories
  if (memories.length) {
    lines.push("What you remember about this learner:");
    for (const m of memories.slice(0, 14)) lines.push(`- [${m.category}] ${m.text}`);
  }

  return { digest: lines.join("\n"), memories };
}
