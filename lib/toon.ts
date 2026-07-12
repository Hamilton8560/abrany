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

const HEADER = /^([A-Za-z0-9_.]+)\[(\d+)\]\{([^}]*)\}:\s*$/;

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
    const [, name, countStr, colsStr] = m;
    const cols = colsStr.split(",").map((c) => c.trim()).filter(Boolean);
    const count = Number(countStr);
    i++;

    const rows: Record<string, string>[] = [];
    while (i < lines.length && rows.length < count) {
      const raw = lines[i];
      if (!raw.trim() || HEADER.test(raw.trim())) break; // stop at blank / next block
      // split into exactly cols.length fields (extra commas fold into the last col)
      const parts = splitFields(raw.trim(), cols.length);
      const row: Record<string, string> = {};
      cols.forEach((c, k) => (row[c] = (parts[k] ?? "").trim()));
      rows.push(row);
      i++;
    }
    out[name] = rows;
  }
  return out;
}

function splitFields(line: string, n: number): string[] {
  const parts = line.split(",");
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
    .filter((r) => r.id && r.label)
    .map((r) => ({ id: r.id, label: r.label, group: (r.group || "default").toLowerCase() }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (b.edges ?? [])
    .filter((r) => ids.has(r.from) && ids.has(r.to))
    .map((r) => ({ from: r.from, to: r.to, label: r.label || "" }));
  return { nodes, edges };
}
