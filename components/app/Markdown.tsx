"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import MermaidBlock from "./MermaidBlock";
import ArchDiagram from "./ArchDiagram";

/**
 * Brand-styled markdown. Used for streaming coach replies and generated lesson
 * content. Tuned for readability on the light glass surfaces.
 */

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 font-display text-[19px] font-extrabold uppercase text-ink first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-[16px] font-bold text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-[14.5px] font-semibold text-ink first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2.5 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2.5 flex list-disc flex-col gap-1 pl-5 marker:text-accent last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 flex list-decimal flex-col gap-1 pl-5 marker:font-semibold marker:text-accent last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-accent underline">
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const raw = String(children);
    const hasLang = /language-(\w+)/.exec(className ?? "");
    const multiline = raw.includes("\n");
    // Architecture diagram: ```arch (TOON node/edge spec) → dagre-laid-out SVG.
    const isArch =
      hasLang?.[1] === "arch" || /^\s*nodes\[\d+\]\{[^}]*\}:/.test(raw);
    if (isArch) return <ArchDiagram spec={raw} />;
    // Detect Mermaid by language tag OR by content — MiniMax often omits the
    // ```mermaid tag and just starts with `flowchart TD` / `sequenceDiagram` / etc.
    const isMermaid =
      hasLang?.[1] === "mermaid" ||
      /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart)\b/.test(
        raw,
      );
    if (isMermaid) return <MermaidBlock code={raw.replace(/\n$/, "")} />;

    const inline = !hasLang && !multiline;
    if (inline)
      return (
        <code className="rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
          {children}
        </code>
      );
    return (
      <code className="mb-2.5 block overflow-x-auto rounded-[10px] bg-ink/90 p-3 font-mono text-[12.5px] text-white last:mb-0">
        {children}
      </code>
    );
  },
  // unwrap <pre> — the `code` renderer above is self-contained (and lets a
  // mermaid diagram render as a block instead of being trapped inside a <pre>)
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="my-2.5 border-l-2 border-accent/50 pl-3 text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
  table: ({ children }) => (
    <div className="mb-2.5 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line bg-white/60 px-2.5 py-1.5 text-left font-semibold text-ink">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-line px-2.5 py-1.5">{children}</td>,
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14px] text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
