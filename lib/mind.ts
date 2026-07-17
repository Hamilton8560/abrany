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
};
export type MindLink = { source: string; target: string; cross: boolean };
export type MindGraph = { nodes: MindNode[]; links: MindLink[] };

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
      `SELECT l.id, l.title, l.objective, l.kind, l.content, g.id gid, g.title gtitle
         FROM lessons l
         JOIN plan_items pi ON pi.id = l.plan_item_id
         JOIN plans p ON p.id = pi.plan_id
         JOIN goals g ON g.id = p.goal_id
        WHERE g.user_id = ? AND l.status = 'ready'
        ORDER BY g.id, pi.order_index, l.order_index`,
    )
    .all(userId) as {
    id: number; title: string; objective: string; kind: string; content: string; gid: number; gtitle: string;
  }[];

  const goalOrder = new Map<number, string[]>(); // gid -> ordered node ids
  for (const l of lessons) {
    const node: MindNode = {
      id: `l${l.id}`,
      label: l.title,
      type: "lesson",
      kind: l.kind,
      cluster: l.gtitle,
      clusterId: `goal${l.gid}`,
      snippet: l.objective || firstLine(l.content),
    };
    add(node);
    const arr = goalOrder.get(l.gid) ?? [];
    if (arr.length) links.push({ source: arr[arr.length - 1], target: node.id, cross: false });
    arr.push(node.id);
    goalOrder.set(l.gid, arr);
  }

  // ── study guides ──
  const guides = db
    .prepare("SELECT id, title, topic, content, goal_id FROM study_guides WHERE user_id = ? AND status = 'ready'")
    .all(userId) as { id: number; title: string; topic: string; content: string; goal_id: number | null }[];
  for (const gd of guides) {
    const goal = gd.goal_id ? (db.prepare("SELECT title FROM goals WHERE id = ?").get(gd.goal_id) as { title: string } | undefined) : undefined;
    const node: MindNode = {
      id: `g${gd.id}`,
      label: gd.title,
      type: "guide",
      cluster: goal?.title ?? "Study guides",
      clusterId: gd.goal_id ? `goal${gd.goal_id}` : "guides",
      snippet: firstLine(gd.content) || gd.topic,
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
      `SELECT c.id, c.title, c.summary, c.content, b.id bid, b.title btitle
         FROM chapters c JOIN books b ON b.id = c.book_id
        WHERE b.user_id = ? AND c.status = 'ready'
        ORDER BY b.id, c.order_index`,
    )
    .all(userId) as { id: number; title: string; summary: string; content: string; bid: number; btitle: string }[];
  const bookOrder = new Map<number, string[]>();
  for (const ch of chapters) {
    const node: MindNode = {
      id: `c${ch.id}`,
      label: ch.title,
      type: "chapter",
      cluster: ch.btitle,
      clusterId: `book${ch.bid}`,
      snippet: ch.summary || firstLine(ch.content),
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

  return { nodes, links };
}
