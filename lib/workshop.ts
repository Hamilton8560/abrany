import { getDb } from "./db";

/**
 * Workshop (beta): AI-authored build & repair manuals in the style of a LEGO /
 * IKEA instruction booklet — an inventory of tools and parts up front, then
 * numbered steps that each say what to grab, what to do, and how to know it's
 * right, with an illustration per step.
 *
 * Two kinds share one shape:
 *   - build  — "build a block house in El Salvador": phases of steps.
 *   - repair — "my treadmill belt slips": a yes/no troubleshooting tree that
 *              narrows the fault, then lands on the fix procedure for it.
 *
 * The model returns JSON; `normalizeManual` is the only gate between that and
 * the UI, so it is defensive about every field. The troubleshooting flowchart
 * is drawn from the tree by `troubleshootMermaid` rather than written by the
 * model, so it can't come back with a mermaid syntax error.
 */

export type ManualKind = "build" | "repair";

export type ManualItem = { name: string; qty: string; note: string };

export type ManualStep = {
  title: string;
  actions: string[];
  parts: ManualItem[];
  tools: string[];
  check: string;
  caution: string;
  /** What the illustration shows — the image prompt (no text in the picture). */
  figure: string;
};

export type ManualProcedure = {
  id: string;
  title: string;
  /** build: what this phase achieves · repair: the fault this fixes. */
  when: string;
  steps: ManualStep[];
};

/** Where an answer leads: another check, a fix procedure, a professional, or done. */
export type CheckTarget = { kind: "check" | "fix"; id: string } | { kind: "pro" | "done" };

export type TroubleCheck = {
  id: string;
  question: string;
  how: string;
  tool: string;
  yes: CheckTarget;
  no: CheckTarget;
};

export type Manual = {
  kind: ManualKind;
  title: string;
  summary: string;
  difficulty: "easy" | "moderate" | "hard" | "pro";
  time: string;
  cost: string;
  safety: string[];
  stopIf: string[];
  tools: ManualItem[];
  parts: ManualItem[];
  troubleshoot: { start: string; checks: TroubleCheck[] } | null;
  procedures: ManualProcedure[];
  aftercare: { test: string[]; maintenance: { every: string; task: string }[] };
};

/* ── normalisation ────────────────────────────────────────── */

const str = (v: unknown, max = 600): string =>
  typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "";

const strList = (v: unknown, maxItems = 12, maxLen = 400): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

const item = (v: unknown): ManualItem | null => {
  if (typeof v === "string") return v.trim() ? { name: v.trim().slice(0, 160), qty: "", note: "" } : null;
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = str(o.name, 160);
  if (!name) return null;
  return { name, qty: str(o.qty ?? o.quantity, 40), note: str(o.note ?? o.spec ?? o.why, 240) };
};

const items = (v: unknown, max = 40): ManualItem[] =>
  (Array.isArray(v) ? v : []).map(item).filter((x): x is ManualItem => !!x).slice(0, max);

/** A safe id: letters, digits, underscore — and never mermaid's reserved `end`. */
const safeId = (v: unknown, fallback: string): string => {
  const id = str(v, 40).replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return id && !/^end$/i.test(id) ? id : fallback;
};

function target(v: unknown, checkIds: Set<string>, fixIds: Set<string>): CheckTarget {
  const raw = str(v, 60);
  if (!raw) return { kind: "pro" };
  const lower = raw.toLowerCase();
  if (lower === "done" || lower === "ok" || lower === "solved") return { kind: "done" };
  if (lower === "pro" || lower === "professional") return { kind: "pro" };
  const fix = /^fix[:\s]+(.+)$/i.exec(raw);
  if (fix) {
    const id = safeId(fix[1], "");
    return fixIds.has(id) ? { kind: "fix", id } : { kind: "pro" };
  }
  const id = safeId(raw, "");
  if (checkIds.has(id)) return { kind: "check", id };
  if (fixIds.has(id)) return { kind: "fix", id };
  return { kind: "pro" };
}

const DIFFICULTY = ["easy", "moderate", "hard", "pro"] as const;

/** Coerce whatever the model returned into a renderable Manual (throws only if it has no steps). */
export function normalizeManual(raw: unknown, kindHint: ManualKind): Manual {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: ManualKind = o.kind === "build" || o.kind === "repair" ? o.kind : kindHint;

  const rawProcs = Array.isArray(o.procedures) ? o.procedures : Array.isArray(o.phases) ? o.phases : [];
  const procedures: ManualProcedure[] = [];
  const seen = new Set<string>();
  rawProcs.slice(0, 12).forEach((p, pi) => {
    if (!p || typeof p !== "object") return;
    const po = p as Record<string, unknown>;
    let id = safeId(po.id, `f${pi + 1}`);
    while (seen.has(id)) id = `${id}_${pi}`;
    const steps: ManualStep[] = (Array.isArray(po.steps) ? po.steps : [])
      .slice(0, 16)
      .map((s): ManualStep | null => {
        if (!s || typeof s !== "object") return null;
        const so = s as Record<string, unknown>;
        const actions = strList(so.actions ?? so.do, 6, 500);
        const title = str(so.title, 140);
        if (!title && !actions.length) return null;
        return {
          title: title || actions[0].slice(0, 80),
          actions,
          parts: items(so.parts, 10),
          tools: strList(so.tools, 8, 80),
          check: str(so.check, 400),
          caution: str(so.caution, 400),
          figure: str(so.figure, 500),
        };
      })
      .filter((s): s is ManualStep => !!s);
    if (!steps.length) return;
    seen.add(id);
    // the UI numbers procedures itself ("Phase 2", "Fix B"), so drop the model's own prefix
    const title = str(po.title, 140).replace(/^(phase|part|stage|step|fix)\s*[\w]{0,3}\s*[:.\-–—]\s*/i, "");
    procedures.push({ id, title: title || `Part ${pi + 1}`, when: str(po.when, 400), steps });
  });
  if (!procedures.length) throw new Error("The manual came back with no steps");

  let troubleshoot: Manual["troubleshoot"] = null;
  const t = o.troubleshoot as Record<string, unknown> | undefined;
  if (kind === "repair" && t && Array.isArray(t.checks)) {
    const rawChecks = t.checks.filter((c): c is Record<string, unknown> => !!c && typeof c === "object").slice(0, 20);
    const ids = rawChecks.map((c, i) => safeId(c.id, `c${i + 1}`));
    const checkIds = new Set(ids);
    const fixIds = new Set(procedures.map((p) => p.id));
    const checks = rawChecks
      .map((c, i) => ({
        id: ids[i],
        question: str(c.question, 240),
        how: str(c.how, 500),
        tool: str(c.tool, 80),
        yes: target(c.yes, checkIds, fixIds),
        no: target(c.no, checkIds, fixIds),
      }))
      .filter((c) => c.question);
    if (checks.length) {
      const start = safeId(t.start, checks[0].id);
      troubleshoot = { start: checks.some((c) => c.id === start) ? start : checks[0].id, checks };
    }
  }

  const after = (o.aftercare ?? {}) as Record<string, unknown>;
  const difficulty = DIFFICULTY.includes(o.difficulty as Manual["difficulty"])
    ? (o.difficulty as Manual["difficulty"])
    : "moderate";

  return {
    kind,
    title: str(o.title, 160) || (kind === "repair" ? "Repair manual" : "Build manual"),
    summary: str(o.summary, 800),
    difficulty,
    time: str(o.time, 60),
    cost: str(o.cost, 60),
    safety: strList(o.safety, 10),
    stopIf: strList(o.stopIf ?? o.callPro, 8),
    tools: items(o.tools),
    parts: items(o.parts),
    troubleshoot,
    procedures,
    aftercare: {
      test: strList(after.test, 8),
      maintenance: (Array.isArray(after.maintenance) ? after.maintenance : [])
        .map((m) => {
          const mo = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
          return { every: str(mo.every ?? mo.interval, 60), task: str(mo.task, 300) };
        })
        .filter((m) => m.task)
        .slice(0, 12),
    },
  };
}

/* ── troubleshooting flowchart ────────────────────────────── */

/** A label mermaid will accept inside double quotes. */
const label = (s: string, max = 60): string => {
  const flat = s.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
  return cut.replace(/"/g, "'").replace(/[<>]/g, "") || "?";
};

/**
 * Mermaid source for the troubleshooting tree. Generated, not model-written:
 * ids are sanitised, every label is quoted, and every edge points at a node
 * this function declared — so the diagram always parses.
 */
export function troubleshootMermaid(m: Manual): string {
  if (!m.troubleshoot) return "";
  const fixTitle = new Map(m.procedures.map((p) => [p.id, p.title]));
  const lines = ["flowchart TD"];
  const declared = new Set<string>();
  const node = (t: CheckTarget): string => {
    if (t.kind === "check") return `c_${t.id}`;
    if (t.kind === "fix") {
      const id = `f_${t.id}`;
      if (!declared.has(id)) {
        declared.add(id);
        lines.push(`  ${id}["🔧 ${label(fixTitle.get(t.id) ?? t.id)}"]:::fix`);
      }
      return id;
    }
    const id = t.kind === "pro" ? "x_pro" : "x_done";
    if (!declared.has(id)) {
      declared.add(id);
      lines.push(t.kind === "pro" ? `  ${id}(["Call a professional"]):::pro` : `  ${id}(["Fixed — test it"]):::done`);
    }
    return id;
  };
  // rounded boxes, not diamonds: a diamond sized to a full question sprawls the chart
  for (const c of m.troubleshoot.checks) lines.push(`  c_${c.id}("${label(c.question, 70)}"):::check`);
  for (const c of m.troubleshoot.checks) {
    lines.push(`  c_${c.id} -->|Yes| ${node(c.yes)}`);
    lines.push(`  c_${c.id} -->|No| ${node(c.no)}`);
  }
  lines.push(
    "  classDef check fill:#ffffff,stroke:#1b2436,stroke-width:2px,color:#1b2436",
    "  classDef fix fill:#e9f4ec,stroke:#67b183,color:#14351f",
    "  classDef pro fill:#fff0e8,stroke:#ff9f7e,color:#5a2414",
    "  classDef done fill:#eef3f9,stroke:#8fa3bd,color:#1b2436",
  );
  return lines.join("\n");
}

/** Stable key for a step's illustration and progress tick. */
export const stepKey = (procIndex: number, stepIndex: number) => `p${procIndex}s${stepIndex}`;

/** Every step that has something to illustrate, in reading order. */
export function figureSteps(m: Manual): { key: string; figure: string; title: string }[] {
  return m.procedures.flatMap((p, pi) =>
    p.steps.map((s, si) => ({ key: stepKey(pi, si), figure: s.figure, title: s.title })).filter((s) => s.figure),
  );
}

/* ── storage ──────────────────────────────────────────────── */

export type ManualImageState = "pending" | "ready" | "error";

export type ManualRow = {
  id: number;
  user_id: number;
  kind: ManualKind;
  title: string;
  request: string; // JSON ManualRequest
  content: string; // JSON Manual ('' while generating)
  images: string; // JSON Record<stepKey, ManualImageState>
  progress: string; // JSON stepKey[] ticked done
  status: "generating" | "ready" | "error";
  error: string;
  created_at: string;
  updated_at: string;
};

export type ManualRequest = {
  description: string;
  item: string; // make / model / what it is
  location: string;
  experience: "beginner" | "handy" | "pro";
};

const parse = <T>(s: string, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const manualContent = (r: ManualRow) => parse<Manual | null>(r.content, null);
export const manualImages = (r: ManualRow) => parse<Record<string, ManualImageState>>(r.images, {});
export const manualProgress = (r: ManualRow) => parse<string[]>(r.progress, []);
export const manualRequest = (r: ManualRow) =>
  parse<ManualRequest>(r.request, { description: "", item: "", location: "", experience: "handy" });

export function createManual(userId: number, kind: ManualKind, req: ManualRequest): ManualRow {
  const title = (req.item || req.description).replace(/\s+/g, " ").trim().slice(0, 120) || "New manual";
  const info = getDb()
    .prepare("INSERT INTO manuals (user_id, kind, title, request) VALUES (?, ?, ?, ?)")
    .run(userId, kind, title, JSON.stringify(req));
  return getManual(Number(info.lastInsertRowid))!;
}

export function getManual(id: number): ManualRow | undefined {
  return getDb().prepare("SELECT * FROM manuals WHERE id = ?").get(id) as ManualRow | undefined;
}

export function listManuals(userId: number): ManualRow[] {
  return getDb()
    .prepare("SELECT * FROM manuals WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as ManualRow[];
}

export const userOwnsManual = (userId: number, id: number): boolean =>
  !!getDb().prepare("SELECT 1 FROM manuals WHERE id = ? AND user_id = ?").get(id, userId);

export function setManualContent(id: number, m: Manual): void {
  getDb()
    .prepare(
      "UPDATE manuals SET title = ?, kind = ?, content = ?, status = 'ready', error = '', updated_at = datetime('now') WHERE id = ?",
    )
    .run(m.title, m.kind, JSON.stringify(m), id);
}

export function setManualStatus(id: number, status: ManualRow["status"], error = ""): void {
  getDb()
    .prepare("UPDATE manuals SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error.slice(0, 500), id);
}

/** Set one step's illustration state (read-modify-write in one statement's transaction). */
export function setManualImage(id: number, key: string, state: ManualImageState | null): void {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = getManual(id);
    if (row) {
      const images = manualImages(row);
      if (state) images[key] = state;
      else delete images[key];
      db.prepare("UPDATE manuals SET images = ? WHERE id = ?").run(JSON.stringify(images), id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function setManualProgress(id: number, done: string[]): void {
  const unique = [...new Set(done.filter((k) => /^p\d+s\d+$/.test(k)))].slice(0, 400);
  getDb().prepare("UPDATE manuals SET progress = ? WHERE id = ?").run(JSON.stringify(unique), id);
}

export function deleteManual(id: number): void {
  getDb().prepare("DELETE FROM manuals WHERE id = ?").run(id);
}
