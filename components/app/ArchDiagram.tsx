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
const NODE_H = 48;
const nodeW = (label: string) => Math.min(260, Math.max(120, label.length * 8 + 34));

export default function ArchDiagram({ spec }: { spec: string }) {
  const layout = useMemo(() => {
    try {
      const { nodes, edges } = parseArchSpec(spec);
      if (!nodes.length) return null;

      const graph = new dagre.graphlib.Graph({ multigraph: true });
      graph.setGraph({ rankdir: "TB", nodesep: 38, ranksep: 58, marginx: 18, marginy: 18 });
      graph.setDefaultEdgeLabel(() => ({}));
      nodes.forEach((n) =>
        graph.setNode(n.id, { width: nodeW(n.label), height: NODE_H, label: n.label, group: n.group }),
      );
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
          return { ...n, x: p.x, y: p.y, w: p.width, h: p.height };
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
              <text
                x={n.x}
                y={n.y + 4.5}
                textAnchor="middle"
                fontSize="13.5"
                fontWeight="600"
                fill={c.text}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
