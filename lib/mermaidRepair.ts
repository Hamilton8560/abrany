/**
 * Repairs the mermaid an LLM *almost* got right.
 *
 * Mermaid is a punctuation-sensitive grammar and a model authoring it inline
 * gets it slightly wrong a meaningful fraction of the time. Every slip used to
 * collapse the diagram into a "couldn't render" box, so this pass fixes the
 * classes we actually saw come back from generation — unquoted labels, prose
 * inside the fence, unicode arrows, reserved words used as node ids, and tails
 * left dangling by a truncated response — before mermaid ever sees the block.
 *
 * Rules only ever run on statements they recognise: repairing a diagram that
 * already parses is worse than leaving it alone, so `tests/mermaidRepair.test.ts`
 * asserts both directions against the real mermaid parser.
 */

/** Keywords that open a diagram — the line after any YAML frontmatter. */
const HEADER =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|xychart-beta|requirementDiagram|C4Context|block-beta|sankey-beta|packet-beta|architecture-beta)\b/;

/** Statement keywords that are never node ids. */
const KEYWORD = /^(subgraph|end|direction|classDef|class|click|style|linkStyle|linkStyle|accTitle|accDescr|title|section|participant|actor|note|loop|alt|else|opt|par|rect|activate|deactivate)\b/i;

/** Any mermaid link operator. */
const ARROW = /-{2,}>|-{2,}|={2,}>|={2,}|-\.-+>|-\.-+|<-{2,}>|o-{2,}o|x-{2,}x/;

/** Punctuation that forces a mermaid label to be quoted. */
const NEEDS_QUOTES = /[(),:[\]{}#;&]/;

/** Wrap a label in quotes unless it already is quoted. */
function quote(label: string): string {
  const t = label.trim();
  if (t.length > 1 && t.startsWith('"') && t.endsWith('"')) return t;
  return `"${t.replace(/"/g, "")}"`;
}

/** Matching close delimiter for each shape opener, longest first. */
const SHAPES: Array<[open: string, close: string]> = [
  ["[[", "]]"],
  ["[(", ")]"],
  ["(((", ")))"],
  ["((", "))"],
  ["{{", "}}"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
];

/**
 * Quote `A[label]` / `A(label)` / `A{label}` labels that carry parse-breaking
 * punctuation. Scans rather than regexes, because a label may itself contain
 * brackets (`A[Array[0] lookup]`) and the close has to be matched by depth.
 */
function quoteShapes(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    // an identifier only opens a shape when it isn't part of a link operator
    const id = /^[A-Za-z0-9_]+/.exec(line.slice(i));
    const prev = i === 0 ? "" : line[i - 1];
    if (!id || /[-=>.<]/.test(prev)) {
      out += line[i++];
      continue;
    }
    const afterId = i + id[0].length;
    const shape = SHAPES.find((s) => line.startsWith(s[0], afterId));
    if (!shape) {
      out += line.slice(i, afterId);
      i = afterId;
      continue;
    }
    const [open, close] = shape;
    // walk to the close that balances this open
    let depth = 0;
    let j = afterId;
    let end = -1;
    while (j < line.length) {
      if (line.startsWith(open, j)) { depth++; j += open.length; continue; }
      if (line.startsWith(close, j)) {
        depth--;
        if (depth === 0) { end = j; break; }
        j += close.length;
        continue;
      }
      j++;
    }
    if (end === -1) {
      out += line.slice(i, afterId);
      i = afterId;
      continue;
    }
    const label = line.slice(afterId + open.length, end);
    out += id[0] + open + (NEEDS_QUOTES.test(label) ? quote(label) : label) + close;
    i = end + close.length;
  }
  return out;
}

export function repairMermaid(code: string): string {
  let c = code
    .replace(/^```(?:mermaid)?[ \t]*\r?\n?/i, "")
    .replace(/\r?\n?```[ \t]*$/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // unicode arrows the model sometimes reaches for instead of ASCII
    .replace(/→/g, "-->")
    .replace(/←/g, "<--")
    .replace(/⇒/g, "==>")
    .replace(/↔/g, "<-->");

  let lines = c.split("\n");

  // --- trim anything that isn't diagram source -----------------------------

  // Prose the model wrote *before* the diagram, inside the fence.
  const headerAt = lines.findIndex((l) => HEADER.test(l.trim()));
  if (headerAt > 0 && !lines[0].trim().startsWith("---")) lines = lines.slice(headerAt);

  // Prose the model wrote *after* it: a sentence, set off by a blank line,
  // carrying no diagram punctuation.
  for (let i = lines.length - 1; i > 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const isProse = /^[A-Z][^\n]*[.!?]$/.test(line) && !ARROW.test(line) && !/[[\](){}|:]/.test(line);
    if (!isProse) break;
    if (lines[i - 1].trim() !== "") break;
    lines = lines.slice(0, i - 1);
    break;
  }

  // A tail left dangling by a truncated response (unterminated arrow or label).
  while (lines.length > 1) {
    const last = lines[lines.length - 1].trimEnd();
    if (last === "") { lines.pop(); continue; }
    const dangling =
      /(-{2,}>?|={2,}>?|-\.-+>?|\|)\s*$/.test(last) ||
      (last.match(/\[/g)?.length ?? 0) !== (last.match(/\]/g)?.length ?? 0) ||
      (last.match(/\(/g)?.length ?? 0) !== (last.match(/\)/g)?.length ?? 0) ||
      (last.match(/"/g)?.length ?? 0) % 2 === 1;
    if (!dangling) break;
    lines.pop();
  }

  const header = lines.find((l) => HEADER.test(l.trim()))?.trim() ?? "";
  const isPie = /^pie\b/.test(header);
  const isFlow = /^(flowchart|graph)\b/.test(header);
  const headerIndex = lines.findIndex((l) => HEADER.test(l.trim()));

  // --- per-statement repairs ----------------------------------------------

  lines = lines.map((line, i) => {
    // never rewrite frontmatter, the header itself, comments or blank lines
    if (i <= headerIndex || !line.trim() || line.trim().startsWith("%%")) return line;

    const indent = line.match(/^\s*/)?.[0] ?? "";
    let body = line.slice(indent.length);

    if (isPie) {
      // pie slices must read `"Label" : value`
      const slice = body.match(/^(.+?)\s*:\s*(\d[\d.]*)\s*$/);
      if (slice && !KEYWORD.test(body)) return `${indent}${quote(slice[1])} : ${slice[2]}`;
      return line;
    }

    if (isFlow) {
      // `A --> B: text` is not flowchart syntax — the label belongs in pipes
      body = body.replace(
        /(-{2,}>|={2,}>|-\.-+>)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/,
        (_m, arrow, target, label: string) => `${arrow}|${quote(label)}| ${target}`,
      );
      // pipe edge labels carrying punctuation must be quoted
      body = body.replace(/\|([^|\n]*)\|/g, (m, label: string) =>
        NEEDS_QUOTES.test(label) ? `|${quote(label)}|` : m,
      );

      // `end` legitimately starts a line (it closes a subgraph) — but only when
      // that line has no link operator on it. `end --> B` is a node called end.
      const statementKeyword = KEYWORD.test(body) && !/^end\b/i.test(body);
      if (ARROW.test(body) && !statementKeyword) {
        // operands around the link operators: ids may not contain spaces, and
        // `end` is a reserved word that breaks the parser when used as one.
        body = body
          .split(new RegExp(`(${ARROW.source}(?:\\|[^|]*\\|)?)`))
          .map((part, idx) => {
            if (idx % 2 === 1) return part; // the operator itself
            const lead = part.match(/^\s*/)?.[0] ?? "";
            const trail = part.match(/\s*$/)?.[0] ?? "";
            const id = part.trim();
            if (!id) return part;
            if (/^end$/i.test(id)) return `${lead}end_node["end"]${trail}`;
            // bare multi-word id → snake id plus the words as its label
            if (/^[A-Za-z][A-Za-z0-9_-]*(?: +[A-Za-z][A-Za-z0-9_-]*)+$/.test(id) && !KEYWORD.test(id))
              return `${lead}${id.replace(/ +/g, "_")}["${id}"]${trail}`;
            return part;
          })
          .join("");
      }
    }

    return `${indent}${quoteShapes(body)}`;
  });

  const repaired = lines.join("\n").trim();

  // Never hand back a diagram we stripped down to nothing. The trimming rules
  // above can, on pathological input, eat every statement and leave a bare
  // header — which mermaid happily renders as an empty box. An honest "couldn't
  // render" fallback beats a blank frame, so give the original back instead and
  // let it fail on its own merits.
  const statements = (src: string) =>
    src.split("\n").filter((l) => l.trim() && !HEADER.test(l.trim()) && !l.trim().startsWith("%%")).length;
  if (statements(repaired) === 0 && statements(code) > 0) return code.trim();

  return repaired;
}
