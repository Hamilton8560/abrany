"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a ```mermaid code block as a diagram — free, client-side (the LLM that
 * writes the diagram is already on the subscription). Covers flowcharts,
 * sequence, timelines, mindmaps, ER, state — the visual/structural half of the
 * "diagrams" modality with zero API cost. Falls back to the raw code on error.
 */

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        // content is authored by our own trusted LLM; loose lets <br/> labels render
        securityLevel: "loose",
        theme: "base",
        // CONCRETE font stack (no CSS var): mermaid measures label widths in a
        // context where var(--font-sans) doesn't resolve, so nodes were sized for
        // the fallback font and clipped the real one. Measure = render = no clip.
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        // calmer, more professional look: soft nodes, muted borders, curved edges
        themeVariables: {
          primaryColor: "#eef3f9",
          primaryTextColor: "#1b2436",
          primaryBorderColor: "#9fb0c6",
          nodeBorder: "#9fb0c6",
          lineColor: "#8795a8",
          secondaryColor: "#f2f6fb",
          tertiaryColor: "#ffffff",
          edgeLabelBackground: "#ffffff",
          clusterBkg: "#f2f6fb",
          clusterBorder: "#d9e0ea",
          titleColor: "#1b2436",
          fontSize: "14px",
          // charts (xychart, pie): brand accent palette instead of invisible defaults
          xyChart: {
            plotColorPalette: "#ff4326, #ff8a3d, #2fbf5b, #1b2436",
            backgroundColor: "transparent",
            titleColor: "#1b2436",
            xAxisLabelColor: "#5c6675",
            xAxisTitleColor: "#5c6675",
            xAxisTickColor: "#8795a8",
            xAxisLineColor: "#d9e0ea",
            yAxisLabelColor: "#5c6675",
            yAxisTitleColor: "#5c6675",
            yAxisTickColor: "#8795a8",
            yAxisLineColor: "#d9e0ea",
          },
          pie1: "#ff4326",
          pie2: "#ff8a3d",
          pie3: "#2fbf5b",
          pie4: "#1b2436",
          pie5: "#8fa3bd",
          pie6: "#b7c3d4",
        },
        flowchart: {
          curve: "basis",
          padding: 16,
          nodeSpacing: 50,
          rankSpacing: 58,
          useMaxWidth: true,
          htmlLabels: true,
          wrappingWidth: 180,
        },
        sequence: { useMaxWidth: true, mirrorActors: false },
        xyChart: { width: 640, height: 320 },
        pie: { useMaxWidth: true },
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

let counter = 0;

/**
 * Auto-repair the mermaid the LLM most often gets slightly wrong, so a diagram
 * renders instead of falling back to raw code: smart quotes, unquoted labels
 * containing parentheses/commas (classic parse breakers), and stray fences.
 */
function sanitizeMermaid(code: string): string {
  let c = code
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  // quote flowchart node labels that contain ()/, but aren't quoted: A[Label (x)] → A["Label (x)"]
  c = c.replace(/([A-Za-z0-9_]+)([[({]{1,2})(?!")([^\]})"\n]*[(),][^\]})"\n]*)([\]})]{1,2})/g, (m, id, open, label, close) => {
    if (open === "((" || open === "{{") return m; // leave special shapes alone
    return `${id}${open}"${label.trim()}"${close}`;
  });
  return c.trim();
}

export default function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${counter++}`);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = await getMermaid();
        try {
          const { svg } = await mermaid.render(`${idRef.current}-a`, code.trim());
          if (alive) setSvg(svg);
        } catch {
          // second chance: auto-repaired source
          const { svg } = await mermaid.render(`${idRef.current}-b`, sanitizeMermaid(code));
          if (alive) setSvg(svg);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (failed) {
    // graceful: never dump a wall of raw code on a slide/lesson — tuck it away
    return (
      <details className="mb-2.5 rounded-[12px] border border-line bg-white/50 px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-muted">
          Diagram couldn&apos;t render — view source
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-[10px] bg-ink/90 p-3 font-mono text-[11.5px] text-white">{code}</pre>
      </details>
    );
  }
  if (!svg) {
    return (
      <div className="mb-2.5 rounded-[12px] border border-line bg-white/40 px-4 py-6 text-center text-[12.5px] text-muted">
        rendering diagram…
      </div>
    );
  }
  return (
    <div
      // The [&_svg_p]/[&_svg_span] pins are load-bearing: mermaid measures node
      // boxes at its own 14px, but surrounding typography (e.g. slide [&_p]
      // clamps) would inflate the HTML labels afterwards and clip them. Pinning
      // label font/margins inside the svg keeps measurement == render.
      className="mb-3 overflow-x-auto rounded-[14px] border border-line bg-white/60 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full [&_svg_p]:!m-0 [&_svg_p]:!text-[14px] [&_svg_p]:!leading-[1.35] [&_svg_span]:!text-[14px] [&_svg_span]:!leading-[1.35]"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
