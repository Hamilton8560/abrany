/**
 * Minimal TOON reader for the tabular subset the app uses:
 *
 *   nodes[3]{id,label,group}:
 *     web,Web App,frontend
 *     api,API,backend
 *     db,Postgres,data
 *
 * Returns a record of block-name -> array of row objects keyed by the columns.
 * (Same shape the cockpit uses; here it feeds the architecture-diagram renderer.)
 */

export type ToonBlocks = Record<string, Record<string, string>[]>;

/**
 * Lenient on purpose: the blocks come from a model, which writes `nodes[3]{…}:`
 * most of the time but also `nodes {…}:`, `nodes[3]{id, label, group}` without
 * the colon, and — most damaging — a count that doesn't match the rows it then
 * lists. The count is treated as a hint: rows run until a blank line or the next
 * header, so a `nodes[3]` followed by five rows keeps all five (and the edges
 * that point at them) instead of silently dropping the last two.
 */
const HEADER = /^([A-Za-z0-9_.]+)\s*(?:\[\d*\])?\s*\{([^}]*)\}\s*:?\s*$/;

export function parseToon(src: string): ToonBlocks {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: ToonBlocks = {};
  let i = 0;

  while (i < lines.length) {
    const m = lines[i].trim().match(HEADER);
    if (!m) {
      i++;
      continue;
    }
    const [, name, colsStr] = m;
    const cols = colsStr.split(",").map((c) => c.trim()).filter(Boolean);
    i++;

    const rows: Record<string, string>[] = [];
    while (i < lines.length) {
      const raw = lines[i].trim().replace(/^[-*]\s+/, ""); // tolerate list-marker rows
      if (!raw || HEADER.test(raw)) break; // stop at blank / next block
      // split into exactly cols.length fields (extra commas fold into the last col)
      const parts = splitFields(raw, cols.length);
      const row: Record<string, string> = {};
      cols.forEach((c, k) => (row[c] = (parts[k] ?? "").trim().replace(/^"(.*)"$/, "$1")));
      rows.push(row);
      i++;
    }
    out[name] = rows;
  }
  return out;
}

/** Split on commas outside double quotes, folding overflow into the final field. */
function splitFields(line: string, n: number): string[] {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  if (parts.length <= n) return parts;
  // fold overflow commas into the final field so a stray comma doesn't shift columns
  return [...parts.slice(0, n - 1), parts.slice(n - 1).join(",")];
}

/* ── architecture-diagram spec ─────────────────────────────── */

export type ArchNode = { id: string; label: string; group: string };
export type ArchEdge = { from: string; to: string; label: string };
export type ArchSpec = { nodes: ArchNode[]; edges: ArchEdge[] };

export function parseArchSpec(src: string): ArchSpec {
  const b = parseToon(src);
  const nodes = (b.nodes ?? [])
    .filter((r) => r.id && (r.label || r.id))
    .map((r) => ({ id: r.id, label: r.label || r.id, group: (r.group || "default").toLowerCase() }));
  // edges sometimes name a node by its label (or a different case) instead of its id
  const byKey = new Map<string, string>();
  for (const n of nodes) {
    byKey.set(n.label.toLowerCase(), n.id);
    byKey.set(n.id.toLowerCase(), n.id);
  }
  const resolve = (ref: string) => byKey.get((ref ?? "").trim().toLowerCase());
  const edges = (b.edges ?? [])
    .map((r) => ({ from: resolve(r.from), to: resolve(r.to), label: r.label || "" }))
    .filter((e): e is ArchEdge => !!e.from && !!e.to);
  return { nodes, edges };
}
