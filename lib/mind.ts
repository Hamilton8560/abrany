import { getDb } from "./db";

/**
 * The "Your Mind" graph — the user's Open Knowledge Format corpus as nodes +
 * links. Every ready lesson, study guide, and book chapter is a node; links are
 * the real structure between them (sequence within a course/book, a guide to its
 * course, explicit [[wiki links]] found in the content, and a light keyword tie
 * across subjects). No embeddings, no vector DB — just the linked markdown.
 */

export type MindNode = {
  id: string;
  label: string;
  type: "lesson" | "guide" | "chapter";
  cluster: string; // subject/book name
  clusterId: string;
  kind?: string; // lesson stage
  snippet: string;
  /** RPG layer — all derived from real training data */
  xp: number; // earned from reading time, completion, reviews, grades
  mastery: number; // 0..1 — how well this is known
  heat: number; // 0..1 — recency; 1 = trained today, →0 = fading
};
export type MindLink = { source: string; target: string; cross: boolean };

/** A brain region as an RPG stat, powered by a real activity signal. */
export type MindRegion = {
  id: string;
  name: string;
  stat: string; // what it levels ("Focus", "Retention", …)
  detail: string; // the real signal behind it
  xp: number;
  level: number;
  progress: number; // 0..1 toward next level
};
export type MindClusterStat = { clusterId: string; cluster: string; xp: number; level: number; progress: number };
export type MindStats = {
  mindLevel: number;
  mindProgress: number; // 0..1 toward next mind level
  totalXp: number;
  streakDays: number;
  regions: MindRegion[];
  clusters: MindClusterStat[];
};
export type MindGraph = { nodes: MindNode[]; links: MindLink[]; stats: MindStats };

/* level curve: reaching level n+1 costs base·n² xp (gentle early, steep later) */
const levelOf = (xp: number, base: number) => Math.floor(Math.sqrt(Math.max(0, xp) / base)) + 1;
const levelProgress = (xp: number, base: number) => {
  const lvl = levelOf(xp, base);
  const lo = base * (lvl - 1) ** 2;
  const hi = base * lvl ** 2;
  return Math.min(1, (xp - lo) / (hi - lo));
};

const daysSince = (iso: string | null): number => {
  if (!iso) return 999;
  const t = new Date(iso.replace(" ", "T") + (iso.includes("Z") || iso.includes("+") ? "" : "Z")).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, (Date.now() - t) / 86_400_000);
};
const heatFrom = (iso: string | null) => Math.exp(-daysSince(iso) / 7); // ~half-life of a week
const gradePts = (g: string) => (/^A/.test(g) ? 1 : /^B/.test(g) ? 0.66 : /^C/.test(g) ? 0.33 : 0);

const firstLine = (md: string) =>
  (md || "")
    .replace(/^#.*$/gm, "")
    .replace(/[#*`>_[\]]/g, "")
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0)
    ?.slice(0, 140) ?? "";

const STOP = new Set([
  "the","and","for","with","your","from","into","that","this","what","when","how","you","are","its",
  "real","using","learn","learning","guide","lesson","intro","basics","fundamentals","part","stage",
]);
const keywords = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP.has(w)),
  );

export function mindGraph(userId: number): MindGraph {
  const db = getDb();
  const nodes: MindNode[] = [];
  const links: MindLink[] = [];
  const byLabel = new Map<string, MindNode>();
  const add = (n: MindNode) => {
    nodes.push(n);
    byLabel.set(n.label.toLowerCase(), n);
  };

  // ── lessons, grouped by goal, in course order ──
  const lessons = db
    .prepare(
      `SELECT l.id, l.title, l.objective, l.kind, l.content, g.id gid, g.title gtitle,
              l.read_sec, l.completed_at, l.srs_reps, l.srs_ease, l.srs_last, l.grade, l.updated_at
         FROM lessons l
         JOIN plan_items pi ON pi.id = l.plan_item_id
         JOIN plans p ON p.id = pi.plan_id
         JOIN goals g ON g.id = p.goal_id
        WHERE g.user_id = ? AND l.status = 'ready'
        ORDER BY g.id, pi.order_index, l.order_index`,
    )
    .all(userId) as {
    id: number; title: string; objective: string; kind: string; content: string; gid: number; gtitle: string;
    read_sec: number; completed_at: string | null; srs_reps: number; srs_ease: number;
    srs_last: string | null; grade: string; updated_at: string;
  }[];

  const goalOrder = new Map<number, string[]>(); // gid -> ordered node ids
  for (const l of lessons) {
    const readMin = (l.read_sec || 0) / 60;
    const done = !!l.completed_at;
    const xp = Math.round(readMin * 2 + (done ? 15 : 0) + (l.srs_reps || 0) * 6 + gradePts(l.grade) * 12);
    const mastery = Math.min(
      1,
      0.12 + (done ? 0.38 : 0) + Math.min(l.srs_reps || 0, 5) * 0.06 + gradePts(l.grade) * 0.2,
    );
    const lastTouch = [l.srs_last, l.completed_at, l.updated_at]
      .filter(Boolean)
      .sort()
      .pop() as string | null;
    const node: MindNode = {
      id: `l${l.id}`,
      label: l.title,
      type: "lesson",
      kind: l.kind,
      cluster: l.gtitle,
      clusterId: `goal${l.gid}`,
      snippet: l.objective || firstLine(l.content),
      xp,
      mastery,
      heat: heatFrom(lastTouch),
    };
    add(node);
    const arr = goalOrder.get(l.gid) ?? [];
    if (arr.length) links.push({ source: arr[arr.length - 1], target: node.id, cross: false });
    arr.push(node.id);
    goalOrder.set(l.gid, arr);
  }

  // ── study guides ──
  const guides = db
    .prepare("SELECT id, title, topic, content, goal_id, updated_at FROM study_guides WHERE user_id = ? AND status = 'ready'")
    .all(userId) as { id: number; title: string; topic: string; content: string; goal_id: number | null; updated_at: string }[];
  for (const gd of guides) {
    const goal = gd.goal_id ? (db.prepare("SELECT title FROM goals WHERE id = ?").get(gd.goal_id) as { title: string } | undefined) : undefined;
    const node: MindNode = {
      id: `g${gd.id}`,
      label: gd.title,
      type: "guide",
      cluster: goal?.title ?? "Study guides",
      clusterId: gd.goal_id ? `goal${gd.goal_id}` : "guides",
      snippet: firstLine(gd.content) || gd.topic,
      xp: 20,
      mastery: 0.45,
      heat: heatFrom(gd.updated_at),
    };
    add(node);
    // tie a guide to its course's first couple of lessons
    if (gd.goal_id) {
      const arr = goalOrder.get(gd.goal_id) ?? [];
      arr.slice(0, 2).forEach((t) => links.push({ source: node.id, target: t, cross: false }));
    }
  }

  // ── book chapters, in reading order ──
  const chapters = db
    .prepare(
      `SELECT c.id, c.title, c.summary, c.content, b.id bid, b.title btitle, c.updated_at
         FROM chapters c JOIN books b ON b.id = c.book_id
        WHERE b.user_id = ? AND c.status = 'ready'
        ORDER BY b.id, c.order_index`,
    )
    .all(userId) as { id: number; title: string; summary: string; content: string; bid: number; btitle: string; updated_at: string }[];
  const bookOrder = new Map<number, string[]>();
  for (const ch of chapters) {
    const node: MindNode = {
      id: `c${ch.id}`,
      label: ch.title,
      type: "chapter",
      cluster: ch.btitle,
      clusterId: `book${ch.bid}`,
      snippet: ch.summary || firstLine(ch.content),
      xp: 18,
      mastery: 0.4,
      heat: heatFrom(ch.updated_at),
    };
    add(node);
    const arr = bookOrder.get(ch.bid) ?? [];
    if (arr.length) links.push({ source: arr[arr.length - 1], target: node.id, cross: false });
    arr.push(node.id);
    bookOrder.set(ch.bid, arr);
  }

  // ── explicit [[wiki links]] in any content ──
  const seen = new Set(links.map((l) => `${l.source}>${l.target}`));
  const linkKey = (a: string, b: string) => (a < b ? `${a}>${b}` : `${b}>${a}`);
  const allContent = [
    ...lessons.map((l) => ({ id: `l${l.id}`, text: l.content })),
    ...guides.map((g) => ({ id: `g${g.id}`, text: g.content })),
    ...chapters.map((c) => ({ id: `c${c.id}`, text: c.content })),
  ];
  for (const { id, text } of allContent) {
    for (const m of (text || "").matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = byLabel.get(m[1].trim().toLowerCase());
      if (target && target.id !== id && !seen.has(linkKey(id, target.id))) {
        const self = nodes.find((n) => n.id === id)!;
        links.push({ source: id, target: target.id, cross: self.clusterId !== target.clusterId });
        seen.add(linkKey(id, target.id));
      }
    }
  }

  // ── a few cross-subject ties by shared distinctive keyword (capped) ──
  const kw = nodes.map((n) => ({ n, k: keywords(`${n.label} ${n.snippet}`) }));
  let crossAdded = 0;
  for (let i = 0; i < kw.length && crossAdded < 6; i++) {
    for (let j = i + 1; j < kw.length && crossAdded < 6; j++) {
      if (kw[i].n.clusterId === kw[j].n.clusterId) continue;
      const shared = [...kw[i].k].some((w) => kw[j].k.has(w));
      const key = linkKey(kw[i].n.id, kw[j].n.id);
      if (shared && !seen.has(key)) {
        links.push({ source: kw[i].n.id, target: kw[j].n.id, cross: true });
        seen.add(key);
        crossAdded++;
      }
    }
  }

  return { nodes, links, stats: computeStats(userId, nodes, lessons) };
}

/** RPG stats — every number traces back to a real signal Abrany logs. */
function computeStats(
  userId: number,
  nodes: MindNode[],
  lessons: { kind: string; read_sec: number; completed_at: string | null; srs_reps: number }[],
): MindStats {
  const db = getDb();

  // Prefrontal — Focus: total focus-timer minutes ever logged
  const focus = db
    .prepare("SELECT COALESCE(SUM(duration_sec),0) n FROM sessions WHERE user_id = ? AND mode='focus'")
    .get(userId) as { n: number };
  const focusMin = Math.round(focus.n / 60);

  // Hippocampus — Retention: spaced-repetition reps across all sections
  const reps = lessons.reduce((a, l) => a + (l.srs_reps || 0), 0);

  // Temporal — Comprehension: minutes spent reading read/teach material
  const comprehendMin = Math.round(
    lessons.filter((l) => l.kind === "read" || l.kind === "teach").reduce((a, l) => a + (l.read_sec || 0), 0) / 60,
  );

  // Cerebellum — Skill: practice/apply sections completed (+ their reading time)
  const skillDone = lessons.filter(
    (l) => (l.kind === "practice" || l.kind === "apply") && l.completed_at,
  ).length;
  const skillMin = Math.round(
    lessons.filter((l) => l.kind === "practice" || l.kind === "apply").reduce((a, l) => a + (l.read_sec || 0), 0) / 60,
  );

  // Association cortex — Creation: things they've made (guides, decks, books)
  const creations = (
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM study_guides WHERE user_id = ?1 AND status='ready')
              + (SELECT COUNT(*) FROM presentations WHERE user_id = ?1 AND status='ready')
              + (SELECT COUNT(*) FROM books WHERE user_id = ?1) AS n`,
      )
      .get(userId) as { n: number }
  ).n;

  const REGION_BASE = 60;
  const mk = (id: string, name: string, stat: string, detail: string, xp: number): MindRegion => ({
    id, name, stat, detail,
    xp: Math.round(xp),
    level: levelOf(xp, REGION_BASE),
    progress: levelProgress(xp, REGION_BASE),
  });
  const regions: MindRegion[] = [
    mk("prefrontal", "Prefrontal cortex", "Focus", `${focusMin} focused minutes logged`, focusMin * 1.2),
    mk("hippocampus", "Hippocampus", "Retention", `${reps} spaced-repetition reps`, reps * 12),
    mk("temporal", "Temporal lobe", "Comprehension", `${comprehendMin} min of reading & lectures`, comprehendMin * 2.5),
    mk("cerebellum", "Cerebellum", "Skill", `${skillDone} practice/apply sections done`, skillDone * 30 + skillMin * 1.5),
    mk("association", "Association cortex", "Creation", `${creations} things created (guides, decks, books)`, creations * 45),
  ];

  // per-subject levels from node XP
  const byCluster = new Map<string, { cluster: string; xp: number }>();
  for (const n of nodes) {
    const c = byCluster.get(n.clusterId) ?? { cluster: n.cluster, xp: 0 };
    c.xp += n.xp;
    byCluster.set(n.clusterId, c);
  }
  const CLUSTER_BASE = 80;
  const clusters: MindClusterStat[] = [...byCluster.entries()]
    .map(([clusterId, c]) => ({
      clusterId,
      cluster: c.cluster,
      xp: c.xp,
      level: levelOf(c.xp, CLUSTER_BASE),
      progress: levelProgress(c.xp, CLUSTER_BASE),
    }))
    .sort((a, b) => b.xp - a.xp);

  // streak: consecutive days (ending today or yesterday) with a focus session
  const dayRows = db
    .prepare(
      "SELECT DISTINCT date(created_at) d FROM sessions WHERE user_id = ? AND mode='focus' ORDER BY d DESC LIMIT 60",
    )
    .all(userId) as { d: string }[];
  let streakDays = 0;
  if (dayRows.length) {
    const days = dayRows.map((r) => r.d);
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const cursor = new Date(today);
    if (days[0] !== iso(cursor)) cursor.setDate(cursor.getDate() - 1); // allow "yesterday" to keep a streak
    for (const d of days) {
      if (d === iso(cursor)) {
        streakDays++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
  }

  const totalXp = regions.reduce((a, r) => a + r.xp, 0);
  const MIND_BASE = 250;
  return {
    mindLevel: levelOf(totalXp, MIND_BASE),
    mindProgress: levelProgress(totalXp, MIND_BASE),
    totalXp,
    streakDays,
    regions,
    clusters,
  };
}
