"use client";

import { useEffect, useRef, useState } from "react";
import { repairMermaid } from "@/lib/mermaidRepair";

/**
 * Renders a ```mermaid code block as a diagram — free, client-side (the LLM that
 * writes the diagram is already on the subscription). Covers flowcharts,
 * sequence, timelines, mindmaps, ER, state — the visual/structural half of the
 * "diagrams" modality with zero API cost. Falls back to the raw code on error.
 */

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    // A rejected promise must NOT stay cached: mermaid is a runtime dynamic
    // import, so one transient chunk fetch failure (a flaky network, or a tab
    // left open across a deploy) would otherwise kill every diagram in the app
    // until a hard reload. Drop the memo on failure so the next block retries.
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
    mermaidPromise.catch(() => {
      mermaidPromise = null;
    });
  }
  return mermaidPromise;
}

/**
 * True for "this diagram is wrong", false for "mermaid itself failed to load".
 * Only the latter is worth a retry.
 */
function isSyntaxError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /parse error|syntax error|no diagram type detected|unknown diagram|lexical error/i.test(
    message,
  );
}

let counter = 0;
/** Quiet period before rendering, so a streaming reply isn't re-parsed on every token. */
const RENDER_DEBOUNCE_MS = 250;

export default function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${counter++}`);

  useEffect(() => {
    let alive = true;
    const rid = idRef.current;
    // Debounced, and every outcome is re-decided per `code`: a coach reply streams
    // in token by token, so this block first sees half a diagram. That fails to
    // parse — and `failed` used to latch, so the finished diagram that arrived a
    // second later was never drawn. Waiting for the source to settle skips most
    // of the half-written renders; resetting the state on success fixes the rest.
    const timer = setTimeout(() => void (async () => {
      // Gate rendering on a successful parse. parse() validates the grammar with
      // NO DOM side-effect; render() on invalid syntax appends its own "Syntax
      // error in text" SVG to <body> and then throws *before* cleaning it up, so
      // the orphaned error graphic would show on the slide even though we catch
      // the throw below. Parsing first means render() only ever runs on valid
      // input, so that error diagram is never drawn.
      const attempt = async () => {
        const mermaid = await getMermaid();
        const renderIfValid = async (src: string, suffix: string) => {
          // parse() is called WITHOUT suppressErrors on purpose. Suppressing
          // flattens two very different failures into the same `false`: a real
          // syntax error (deterministic — retrying is pointless) and a failed
          // lazy import of mermaid's per-diagram-type chunk (a network flake —
          // retrying is the whole fix). Catch and tell them apart instead.
          try {
            await mermaid.parse(src);
          } catch (err) {
            if (isSyntaxError(err)) {
              console.warn("[mermaid] source did not parse", err);
              return false;
            }
            throw err;
          }
          const { svg } = await mermaid.render(`${rid}-${suffix}`, src);
          if (alive) {
            setSvg(svg);
            setFailed(false);
          }
          return true;
        };
        // as written, then auto-repaired (models get mermaid slightly wrong often)
        if (await renderIfValid(code.trim(), "a")) return true;
        return renderIfValid(repairMermaid(code), "b");
      };
      try {
        try {
          if (await attempt()) return;
        } catch (err) {
          // A throw here is infrastructure, not syntax — mermaid's own module or
          // one of its per-diagram-type chunks failed to load. Those are network
          // flakes, so give it exactly one more go before giving up.
          if (!alive) return;
          console.warn("[mermaid] render failed, retrying once", err);
          if (await attempt()) return;
        }
        if (alive) {
          setSvg("");
          setFailed(true);
        }
      } catch (err) {
        // Surface the reason: without this, a chunk-load failure and a genuine
        // syntax error are indistinguishable from the outside.
        console.warn("[mermaid] giving up on diagram", err);
        if (alive) {
          setSvg("");
          setFailed(true);
        }
      } finally {
        // Defense in depth: should a render ever throw *after* a clean parse,
        // mermaid can still leave its temp <div id="d{id}"> (and the #{id} svg)
        // orphaned in <body>. Remove any such leftovers for both attempts.
        for (const suffix of ["a", "b"]) {
          document.getElementById(`d${rid}-${suffix}`)?.remove();
          document.getElementById(`${rid}-${suffix}`)?.remove();
        }
      }
    })(), RENDER_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
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
