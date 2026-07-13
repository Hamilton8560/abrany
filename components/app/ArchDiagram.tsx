"use client";

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { parseArchSpec } from "@/lib/toon";

/**
 * Architecture / system diagrams from a compact TOON node+edge spec.
 * The AI emits structure (reliable to generate); dagre auto-lays-it-out
 * (deterministic, no overlaps); we render clean branded SVG. This is the
 * "structured spec -> layout engine" path — nicer boxes-and-arrows than a
 * flowchart, without hand-placed coordinates.
 */

const GROUPS: Record<string, { fill: string; border: string; text: string }> = {
  frontend: { fill: "#eef3f9", border: "#8fa3bd", text: "#1b2436" },
  ui: { fill: "#eef3f9", border: "#8fa3bd", text: "#1b2436" },
  backend: { fill: "#e6edf7", border: "#6f86a6", text: "#1b2436" },
  service: { fill: "#e9f4ec", border: "#67b183", text: "#14351f" },
  data: { fill: "#fff0e8", border: "#ff9f7e", text: "#5a2414" },
  db: { fill: "#fff0e8", border: "#ff9f7e", text: "#5a2414" },
  external: { fill: "#f1eefb", border: "#a98fe6", text: "#2b2447" },
  queue: { fill: "#fdf3e0", border: "#e0b45c", text: "#4a3708" },
  default: { fill: "#f2f6fb", border: "#c1cddd", text: "#1b2436" },
};

const g = (group: string) => GROUPS[group] ?? GROUPS.default;

/* Node text metrics — labels WRAP to fit the box (no more clipped words). */
const FONT = 13.5;
const CHAR_W = 7.15; // ~avg glyph width at FONT / weight 600
const LINE_H = 17;
const PAD_X = 16; // per side
const PAD_Y = 13; // per side
const MAX_CHARS = 26; // preferred wrap width (~200px of text)
const HARD_CHARS = 34; // absolute cap before a long word is hyphen-broken
const MAX_LINES = 4;

/** Greedy word-wrap; hyphen-breaks any single word wider than the hard cap. */
function wrapLabel(label: string): string[] {
  const lines: string[] = [];
  let cur = "";
  for (let word of label.trim().split(/\s+/).filter(Boolean)) {
    while (word.length > HARD_CHARS) {
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, HARD_CHARS - 1) + "-");
      word = word.slice(HARD_CHARS - 1);
    }
    if (!cur) cur = word;
    else if ((cur + " " + word).length <= MAX_CHARS) cur += " " + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (!lines.length) lines.push(label);
  if (lines.length > MAX_LINES) {
    lines.length = MAX_LINES;
    lines[MAX_LINES - 1] = lines[MAX_LINES - 1].replace(/.{1}$/, "…");
  }
  return lines;
}

const nodeSize = (lines: string[]) => {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const w = Math.min(HARD_CHARS * CHAR_W + PAD_X * 2, Math.max(120, longest * CHAR_W + PAD_X * 2));
  const h = Math.max(46, lines.length * LINE_H + PAD_Y * 2);
  return { w, h };
};

export default function ArchDiagram({ spec }: { spec: string }) {
  const layout = useMemo(() => {
    try {
      const { nodes, edges } = parseArchSpec(spec);
      if (!nodes.length) return null;

      const wrapped = new Map(nodes.map((n) => [n.id, wrapLabel(n.label)] as const));

      const graph = new dagre.graphlib.Graph({ multigraph: true });
      graph.setGraph({ rankdir: "TB", nodesep: 38, ranksep: 58, marginx: 18, marginy: 18 });
      graph.setDefaultEdgeLabel(() => ({}));
      nodes.forEach((n) => {
        const { w, h } = nodeSize(wrapped.get(n.id)!);
        graph.setNode(n.id, { width: w, height: h, label: n.label, group: n.group });
      });
      edges.forEach((e, i) =>
        graph.setEdge(
          e.from,
          e.to,
          { label: e.label, width: e.label ? e.label.length * 6 + 8 : 0, height: e.label ? 16 : 0 },
          `e${i}`,
        ),
      );
      dagre.layout(graph);

      const gg = graph.graph();
      return {
        width: gg.width ?? 400,
        height: gg.height ?? 300,
        nodes: nodes.map((n) => {
          const p = graph.node(n.id);
          return { ...n, x: p.x, y: p.y, w: p.width, h: p.height, lines: wrapped.get(n.id)! };
        }),
        edges: edges.map((e, i) => {
          const ge = graph.edge(e.from, e.to, `e${i}`) as { points: { x: number; y: number }[] };
          return { ...e, points: ge?.points ?? [] };
        }),
      };
    } catch {
      return null;
    }
  }, [spec]);

  if (!layout) {
    return (
      <pre className="mb-2.5 overflow-x-auto rounded-[10px] bg-ink/90 p-3 font-mono text-[12px] text-white">
        {spec}
      </pre>
    );
  }

  const { width, height, nodes, edges } = layout;

  return (
    <div className="mb-3 overflow-x-auto rounded-[14px] border border-line bg-white/60 p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="h-auto w-full"
        style={{ maxWidth: "100%" }}
        role="img"
      >
        <defs>
          <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#8795a8" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          if (e.points.length < 2) return null;
          const d = e.points.map((p, k) => `${k === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          const mid = e.points[Math.floor(e.points.length / 2)];
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#8795a8" strokeWidth="1.6" markerEnd="url(#arch-arrow)" />
              {e.label && (
                <>
                  <rect
                    x={mid.x - (e.label.length * 5.6) / 2 - 4}
                    y={mid.y - 9}
                    width={e.label.length * 5.6 + 8}
                    height={18}
                    rx={5}
                    fill="#ffffff"
                    stroke="#e5ebf3"
                  />
                  <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontSize="11" fill="#5c6675">
                    {e.label}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const c = g(n.group);
          const totalH = n.lines.length * LINE_H;
          return (
            <g key={n.id}>
              <rect
                x={n.x - n.w / 2}
                y={n.y - n.h / 2}
                width={n.w}
                height={n.h}
                rx={12}
                fill={c.fill}
                stroke={c.border}
                strokeWidth="1.5"
              />
              {n.lines.map((line, i) => (
                <text
                  key={i}
                  x={n.x}
                  y={n.y - totalH / 2 + LINE_H * (i + 0.5)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={FONT}
                  fontWeight="600"
                  fill={c.text}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
