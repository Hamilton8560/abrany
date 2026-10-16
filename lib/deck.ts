/**
 * Splits a markdown deck into slides on `---` rules.
 *
 * Fence-aware on purpose: a mermaid block may open with YAML frontmatter
 * (```mermaid then `---` / `title: …` / `---`), and a naive split turns one
 * slide into four — destroying the diagram and spilling its source across the
 * deck. Only a `---` outside a fenced block is a slide break.
 */
export function splitSlides(content: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  for (const line of content.split("\n")) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (open) {
      if (fence === null) fence = open[1][0];
      else if (line.trim().startsWith(fence.repeat(3))) fence = null;
      current.push(line);
      continue;
    }
    if (fence === null && /^[ \t]*---[ \t]*$/.test(line)) {
      slides.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join("\n"));

  return slides.map((s) => s.trim()).filter(Boolean);
}
