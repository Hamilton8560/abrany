import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSlides } from "../lib/deck.ts";

test("splits slides on horizontal rules", () => {
  assert.deepEqual(splitSlides("# One\n\n---\n\n# Two\n\n---\n\n# Three"), [
    "# One",
    "# Two",
    "# Three",
  ]);
});

test("a mermaid block's YAML frontmatter is not a slide break", () => {
  // This deck used to explode into five slides, with the diagram destroyed and
  // its source spilled across three of them.
  const deck = [
    "# Slide one",
    "",
    "---",
    "",
    "# Slide two",
    "",
    "```mermaid",
    "---",
    "title: Feedback loop",
    "---",
    "flowchart TD",
    '  A["Practice"] --> B["Feedback"]',
    "```",
    "",
    "---",
    "",
    "# Slide three",
  ].join("\n");

  const slides = splitSlides(deck);
  assert.equal(slides.length, 3);
  assert.ok(slides[1].includes("```mermaid"));
  assert.ok(slides[1].includes("title: Feedback loop"));
  assert.ok(slides[1].includes('A["Practice"] --> B["Feedback"]'));
  assert.ok(slides[1].trimEnd().endsWith("```"));
});

test("a --- inside a plain code fence is not a slide break", () => {
  const slides = splitSlides("# One\n\n```\n---\n```\n\n---\n\n# Two");
  assert.equal(slides.length, 2);
  assert.ok(slides[0].includes("---"));
});

test("drops empty slides from trailing or doubled rules", () => {
  assert.deepEqual(splitSlides("# One\n\n---\n\n---\n\n# Two\n\n---\n"), ["# One", "# Two"]);
});
