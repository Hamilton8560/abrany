import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { repairMermaid } from "../lib/mermaidRepair.ts";

// mermaid's parser sanitizes labels through DOMPurify, which needs a real DOM.
// Give the process one so these tests exercise the actual mermaid grammar
// rather than a string-shape approximation of it.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
for (const key of [
  "window",
  "document",
  "DOMParser",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "NodeFilter",
  "CSSStyleSheet",
] as const) {
  // `navigator` and friends are getter-only on globalThis in modern Node, so
  // define rather than assign.
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? dom.window : (dom.window as unknown as Record<string, unknown>)[key],
    configurable: true,
    writable: true,
  });
}

/**
 * Every case here is a shape a model actually emitted into a lesson, deck or
 * chapter. The assertion is the one that matters to a reader: after repair,
 * mermaid can parse it — so the diagram draws instead of collapsing into the
 * "couldn't render" box.
 */
const BROKEN: Array<[name: string, src: string]> = [
  ["edge label with parens", "flowchart LR\n  A -->|Yes (mostly)| B"],
  ["colon edge label", "flowchart LR\n  A --> B: sometimes"],
  ["unicode arrow", "flowchart LR\n  A → B"],
  ["node id with spaces", "flowchart LR\n  Working Memory --> Long Term"],
  ["end as a node id", "flowchart TD\n  A --> end"],
  ["end as a node id on both sides", "flowchart TD\n  A --> end\n  end --> B"],
  ["brackets inside a label", "flowchart LR\n  A[Array[0] lookup] --> B[Done]"],
  ["unquoted pie slices", "pie title Split\n  Study : 50\n  Practice : 50"],
  ["trailing prose inside the fence", "flowchart LR\n  A --> B\n\nThis diagram shows the flow."],
  ["truncated mid-diagram", 'flowchart TD\n  A["Start"] --> B["Mid"]\n  B --> '],
  ["unquoted parens in a label", "flowchart LR\n  A[Working memory (short)] --> B[Long-term]"],
  ["unquoted comma in a label", "flowchart LR\n  A[Plan, do, review] --> B[Ship]"],
  ["smart quotes", 'flowchart LR\n  A[“Smart quoted”] --> B[“Also”]'],
];

test("never strips a diagram down to a bare header", () => {
  // An empty rendered frame is a worse answer than the "couldn't render"
  // fallback, so repair hands the original back rather than emptying it out.
  for (const hopeless of ["flowchart LR\n  ((( ??? %%% |||", "flowchart LR\n  A[unclosed --> B"]) {
    const repaired = repairMermaid(hopeless);
    const statements = repaired
      .split("\n")
      .filter((l) => l.trim() && !/^(flowchart|graph)\b/.test(l.trim()));
    assert.ok(statements.length > 0, `repair emptied the diagram:\n${repaired}`);
  }
});

/** Diagrams that already parse must survive the repair pass untouched in meaning. */
const ALREADY_GOOD: Array<[name: string, src: string]> = [
  ["plain flowchart", 'flowchart TD\n  A["Start"] --> B["End"]'],
  ["subgraph", "flowchart TD\n  subgraph Phase One\n    A --> B\n  end\n  B --> C"],
  ["sequence", "sequenceDiagram\n  participant U as User\n  U->>S: request"],
  ["frontmatter", "---\ntitle: Loop\n---\nflowchart TD\n  A --> B\n  B --> A"],
  ["quoted pipe label", 'flowchart LR\n  A -->|"Yes (mostly)"| B'],
  ["quoted pie", 'pie title Split\n  "Study" : 50'],
  ["mindmap", "mindmap\n  root((Memory))\n    Encoding\n    Storage"],
  ["timeline", "timeline\n  title Learning\n  Week 1 : Basics"],
  ["state", "stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]"],
  ["er", "erDiagram\n  USER ||--o{ GOAL : owns"],
  ["xychart", 'xychart-beta\n  title "Retention"\n  x-axis [d1, d2]\n  line [100, 60]'],
  ["class", "classDiagram\n  class Goal {\n    +String title\n  }"],
];

let lastError = "";

async function parses(src: string): Promise<boolean> {
  const mermaid = (await import("mermaid")).default;
  try {
    return Boolean(await mermaid.parse(src));
  } catch (e) {
    lastError = (e as Error).message;
    return false;
  }
}

for (const [name, src] of BROKEN) {
  test(`repairs: ${name}`, async () => {
    const repaired = repairMermaid(src);
    assert.ok(
      await parses(repaired),
      `still unparseable after repair (${lastError}):\n${repaired}`,
    );
  });
}

for (const [name, src] of ALREADY_GOOD) {
  test(`leaves valid mermaid parseable: ${name}`, async () => {
    assert.ok(await parses(src), `fixture itself is invalid (${lastError}): ${name}`);
    const repaired = repairMermaid(src);
    assert.ok(
      await parses(repaired),
      `repair BROKE a valid diagram:\n--- before ---\n${src}\n--- after ---\n${repaired}`,
    );
  });
}
