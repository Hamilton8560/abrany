import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createUser } from "../lib/repo.ts";
import {
  normalizeManual,
  troubleshootMermaid,
  figureSteps,
  createManual,
  getManual,
  manualContent,
  manualImages,
  manualProgress,
  setManualContent,
  setManualImage,
  setManualProgress,
  userOwnsManual,
} from "../lib/workshop.ts";
import { unwrapMarkdownFence } from "../lib/coach.ts";
import { parseArchSpec } from "../lib/toon.ts";

// mermaid's parser needs a DOM (DOMPurify) — same harness as mermaidRepair.test.ts
const dom = new JSDOM("<!doctype html><html><body></body></html>");
for (const key of ["window", "document", "DOMParser", "Node", "Element", "HTMLElement", "SVGElement", "NodeFilter", "CSSStyleSheet"] as const)
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? dom.window : (dom.window as unknown as Record<string, unknown>)[key],
    configurable: true,
    writable: true,
  });

/** The shape a model sends back for "treadmill shows E1, belt won't move" — warts included. */
const RAW_REPAIR = {
  title: "Treadmill E1 — belt won't move",
  difficulty: "extreme", // not a real level → moderate
  safety: ["Unplug and wait 5 minutes for the controller capacitors to drain", 42, ""],
  tools: ["Multimeter", { name: "Phillips #2", qty: 1 }],
  parts: [{ name: "Motor brushes", quantity: "2", spec: "match the old ones" }, { qty: "3" }],
  troubleshoot: {
    start: "power",
    checks: [
      { id: "power", question: "Does the display light up?", how: "Plug in, insert safety key", yes: "key", no: "fix:fuse" },
      { id: "key", question: 'Is the "safety key" seated?', how: "Push it until it clicks", yes: "end", no: "done" },
      { id: "brushes", question: "Are the brushes under 6 mm?", yes: "fix:brushes", no: "fix:does-not-exist" },
      { question: "" }, // empty → dropped
    ],
  },
  procedures: [
    { id: "fuse", title: "Fix: replace the fuse", steps: [{ title: "Pull the fuse", actions: ["Open the holder"], figure: "hand pulling a glass fuse from a holder" }] },
    { id: "brushes", title: "Fix: replace the brushes", steps: [{ do: ["Unscrew the brush caps"], parts: [{ name: "Brush", qty: 2 }] }, {}] },
    { id: "empty", title: "No steps", steps: [] }, // dropped
  ],
};

test("normalizeManual coerces sloppy model output into a renderable manual", () => {
  const m = normalizeManual(RAW_REPAIR, "repair");
  assert.equal(m.kind, "repair");
  assert.equal(m.difficulty, "moderate");
  assert.deepEqual(m.safety, ["Unplug and wait 5 minutes for the controller capacitors to drain", "42"]);
  assert.deepEqual(m.tools.map((t) => t.name), ["Multimeter", "Phillips #2"]);
  assert.deepEqual(m.parts, [{ name: "Motor brushes", qty: "2", note: "match the old ones" }]);
  assert.deepEqual(m.procedures.map((p) => p.id), ["fuse", "brushes"]);
  // a step with only actions gets a title from them; an empty step is dropped
  assert.equal(m.procedures[1].steps.length, 1);
  assert.equal(m.procedures[1].steps[0].title, "Unscrew the brush caps");
  assert.deepEqual(m.procedures[1].steps[0].parts, [{ name: "Brush", qty: "2", note: "" }]);

  const checks = new Map(m.troubleshoot!.checks.map((c) => [c.id, c]));
  assert.equal(m.troubleshoot!.start, "power");
  assert.equal(checks.size, 3);
  assert.deepEqual(checks.get("power")!.no, { kind: "fix", id: "fuse" });
  assert.deepEqual(checks.get("power")!.yes, { kind: "check", id: "key" });
  // "end" is not a check id — and must never become a mermaid node called end
  assert.deepEqual(checks.get("key")!.yes, { kind: "pro" });
  assert.deepEqual(checks.get("key")!.no, { kind: "done" });
  // a fix that doesn't exist routes to a professional instead of a dead end
  assert.deepEqual(checks.get("brushes")!.no, { kind: "pro" });
});

test("normalizeManual refuses a manual with no steps, and drops troubleshooting on builds", () => {
  assert.throws(() => normalizeManual({ procedures: [{ steps: [] }] }, "build"), /no steps/);
  const b = normalizeManual({ phases: [{ title: "Footing", steps: [{ title: "Dig" }] }], troubleshoot: RAW_REPAIR.troubleshoot }, "build");
  assert.equal(b.troubleshoot, null);
  assert.equal(b.procedures[0].title, "Footing");
  const prefixed = normalizeManual({ phases: [{ title: "Phase 0: Permits", steps: [{ title: "x" }] }, { title: "Fix: replace the fuse", steps: [{ title: "y" }] }] }, "build");
  assert.deepEqual(prefixed.procedures.map((p) => p.title), ["Permits", "replace the fuse"]);
});

test("the generated troubleshooting flowchart always parses", async () => {
  const mermaid = (await import("mermaid")).default;
  const m = normalizeManual(RAW_REPAIR, "repair");
  const src = troubleshootMermaid(m);
  assert.match(src, /^flowchart TD/);
  await mermaid.parse(src); // throws on a syntax error

  // hostile labels: quotes, brackets, pipes, arrows, html, a reserved-word id
  const nasty = normalizeManual(
    {
      troubleshoot: {
        checks: [
          { id: "end", question: 'Is the "E7" code shown [blinking] | --> <b>now</b>?', yes: "fix:a b", no: "c2" },
          { id: "c2", question: "Belt (front) slipping; > 2 cm sag?", yes: "pro", no: "done" },
        ],
      },
      procedures: [{ id: "a b", title: 'Swap the "MCB" board (main) | [care]', steps: [{ title: "x" }] }],
    },
    "repair",
  );
  await mermaid.parse(troubleshootMermaid(nasty));
});

test("figureSteps lists only steps with a picture to draw, keyed by position", () => {
  const m = normalizeManual(RAW_REPAIR, "repair");
  assert.deepEqual(figureSteps(m).map((s) => s.key), ["p0s0"]);
});

test("manual storage: content, per-step image state and progress are independent", () => {
  const user = createUser("builder@example.com", "hash");
  const other = createUser("other@example.com", "hash");
  const row = createManual(user.id, "repair", { description: "treadmill E1", item: "", location: "", experience: "handy" });
  assert.equal(row.status, "generating");
  assert.ok(userOwnsManual(user.id, row.id));
  assert.ok(!userOwnsManual(other.id, row.id));

  setManualContent(row.id, normalizeManual(RAW_REPAIR, "repair"));
  setManualImage(row.id, "p0s0", "pending");
  setManualProgress(row.id, ["p0s0", "p0s0", "bogus", "p1s0"]);
  setManualImage(row.id, "p0s0", "ready");

  const after = getManual(row.id)!;
  assert.equal(after.status, "ready");
  assert.equal(after.title, "Treadmill E1 — belt won't move");
  assert.equal(manualContent(after)!.procedures.length, 2);
  assert.deepEqual(manualImages(after), { p0s0: "ready" });
  assert.deepEqual(manualProgress(after), ["p0s0", "p1s0"]);
});

test("unwrapMarkdownFence strips only a real whole-document wrapper", () => {
  assert.equal(unwrapMarkdownFence("```markdown\n# Hi\n\ntext\n```"), "# Hi\n\ntext");
  // a document that ENDS with a diagram keeps the diagram's closing fence
  const endsWithDiagram = "Intro\n\n```mermaid\nflowchart LR\n  A --> B\n```";
  assert.equal(unwrapMarkdownFence(endsWithDiagram), endsWithDiagram);
  // a document that STARTS with a diagram is left whole
  const startsWithDiagram = "```mermaid\nflowchart LR\n  A --> B\n```\n\nThen prose.";
  assert.equal(unwrapMarkdownFence(startsWithDiagram), startsWithDiagram);
  // a wrapped document that contains a diagram is unwrapped intact
  assert.equal(
    unwrapMarkdownFence("```md\nIntro\n\n```mermaid\nflowchart LR\n  A --> B\n```\n```"),
    "Intro\n\n```mermaid\nflowchart LR\n  A --> B\n```",
  );
});

test("parseArchSpec survives a wrong row count, header variants, quoted commas and label refs", () => {
  const spec = `nodes[2] {id, label, group}
web,Web App,frontend
api,"API, v2",backend
db,Postgres,data

edges{from,to,label}:
- web,api,calls
api,Postgres,reads
web,nowhere,dropped`;
  const { nodes, edges } = parseArchSpec(spec);
  assert.deepEqual(nodes.map((n) => n.id), ["web", "api", "db"]);
  assert.equal(nodes[1].label, "API, v2");
  assert.deepEqual(edges, [
    { from: "web", to: "api", label: "calls" },
    { from: "api", to: "db", label: "reads" },
  ]);
});
