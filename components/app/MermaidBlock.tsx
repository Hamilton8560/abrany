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
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        themeVariables: {
          primaryColor: "#e8eef6",
          primaryTextColor: "#1b2436",
          primaryBorderColor: "#ff4326",
          lineColor: "#5c6675",
          secondaryColor: "#ffe4dc",
          tertiaryColor: "#f2f6fb",
          fontSize: "14px",
        },
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

let counter = 0;

export default function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${counter++}`);

  useEffect(() => {
    let alive = true;
    getMermaid()
      .then((mermaid) => mermaid.render(idRef.current, code.trim()))
      .then(({ svg }) => {
        if (alive) setSvg(svg);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  if (failed) {
    return (
      <pre className="mb-2.5 overflow-x-auto rounded-[10px] bg-ink/90 p-3 font-mono text-[12px] text-white">
        {code}
      </pre>
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
      className="mb-3 overflow-x-auto rounded-[14px] border border-line bg-white/60 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
