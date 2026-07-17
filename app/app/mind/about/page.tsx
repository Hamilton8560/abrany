import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { BrainGlyph } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Visible documentation for the OKF-powered "Your Mind" + tutor memory. */
export default async function MindAboutPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8 pb-10">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            HOW IT WORKS
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          Your knowledge, as an open format
        </h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted">
          Everything Abrany writes for you is stored the way a second brain should be — plain, linked,
          and yours. That&apos;s the Open Knowledge Format, and it&apos;s what powers both{" "}
          <Link href="/app/mind" className="font-medium text-accent">Your Mind</Link> and a coach that
          actually knows you.
        </p>
      </header>

      {/* What OKF is */}
      <section className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-6 sm:p-7">
        <h2 className="font-display text-[17px] font-extrabold uppercase text-ink">
          What the Open Knowledge Format is
        </h2>
        <p className="text-[14.5px] leading-relaxed text-ink">
          <strong>Google introduced the Open Knowledge Format (OKF) in June 2026</strong> — building on
          Andrej Karpathy&apos;s earlier &ldquo;LLM Wiki&rdquo; idea — as a vendor-neutral way to give AI
          a knowledge base without a vector database. Instead of turning your knowledge into opaque
          numbers (embeddings) in a database, OKF keeps it as a <strong>folder of plain Markdown files</strong>:
        </p>
        <ul className="flex flex-col gap-2 pl-1 text-[14px] leading-relaxed text-muted">
          {[
            ["One concept per file,", "each a short Markdown note with a title and definition."],
            ["A little YAML on top", "(type, title, description, tags, updated) so it&apos;s self-describing."],
            ["Explicit links between concepts", "— the author decides what connects to what, and those links are kept."],
            ["An index that ties it together,", "so an agent can start at the top and navigate down."],
          ].map(([b, rest], i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <strong className="text-ink">{b}</strong> <span dangerouslySetInnerHTML={{ __html: rest }} />
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[14.5px] leading-relaxed text-ink">
          The key difference from a vector database: an AI <strong>navigates OKF deterministically</strong>{" "}
          — read the index, open the relevant concept, follow its links to related concepts — rather than
          guessing at relationships from embedding similarity. Because it&apos;s just text, it&apos;s
          transparent, versionable in Git, needs no re-indexing when it changes, and is easy for a human
          to read and correct.
        </p>

        {/* concrete spec example */}
        <div className="overflow-x-auto rounded-[12px] border border-line bg-ink/95 p-4">
          <pre className="font-mono text-[12px] leading-relaxed text-white/90">{`--- preterite-vs-imperfect.md ---
---
type: concept
title: Preterite vs imperfect
tags: [spanish, grammar, past-tense]
updated: 2026-07-17
---
The preterite is for a finished, one-time action;
the imperfect is for background, habit, or ongoing.

Related: [Present tense](./present-tense.md),
         [Capstone conversation](./capstone.md)`}</pre>
        </div>

        <p className="text-[13px] leading-relaxed text-muted">
          OKF is <em>complementary</em> to traditional RAG, not a wholesale replacement — Google&apos;s own
          guidance is a hybrid: OKF for the curated, authoritative knowledge you want an agent to reason
          over, and RAG for searching huge piles of unstructured documents. For a personal learning
          corpus, OKF is exactly the right layer.
        </p>
      </section>

      {/* How Abrany uses it */}
      <section className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-6 sm:p-7">
        <h2 className="font-display text-[17px] font-extrabold uppercase text-ink">
          How Abrany uses it
        </h2>
        <p className="text-[14.5px] leading-relaxed text-ink">
          Abrany was already OKF-shaped before OKF had a name: every lesson, study guide, and book
          chapter it generates is <strong>linked Markdown</strong>. So your own material <em>is</em> your
          knowledge base — no embeddings, no vector database, no monthly bill for one.
        </p>
        <div className="flex flex-col gap-3">
          {[
            [
              "Your Mind",
              "The constellation you can fly through is your OKF corpus made visible — each lesson, guide, and chapter is a node, and the threads between them are the real links (course order, a guide to its course, and concept-to-concept references).",
              "/app/mind",
            ],
            [
              "A coach that follows the links",
              "When you discuss a topic, the tutor reads from that corner of your knowledge and follows its links to related concepts — the same deterministic navigation OKF is built for — instead of hoping a search turns up the right passage.",
              null,
            ],
          ].map(([title, body, href], i) => (
            <div key={i} className="rounded-[14px] bg-white/55 px-4 py-3.5">
              <p className="text-[14px] font-semibold text-ink">
                {href ? (
                  <Link href={href as string} className="hover:text-accent">
                    {title} →
                  </Link>
                ) : (
                  title
                )}
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Personalized memory */}
      <section id="memory" className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-6 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-accent/12 text-accent">
            <BrainGlyph className="size-4" />
          </span>
          <h2 className="font-display text-[17px] font-extrabold uppercase text-ink">
            How your coach remembers you
          </h2>
        </div>
        <p className="text-[14.5px] leading-relaxed text-ink">
          Knowledge is only half of it. On top of your OKF corpus, Abrany keeps a{" "}
          <strong>learner memory</strong> — a picture of <em>you</em> — so coaching is personal and pushes
          you toward what actually helps. It comes from two places:
        </p>
        <ul className="flex flex-col gap-2 pl-1 text-[14px] leading-relaxed text-muted">
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">Signals Abrany already tracks</strong> — your mastery per topic,
              which sections are shaky or overdue for review, how much time you&apos;ve put in and when you
              last studied.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-ink">Durable memories</strong> — facts worth carrying between
              sessions: your goals, how you learn best, what trips you up, your context. The coach records
              these as you talk, and you can add or forget any of them.
            </span>
          </li>
        </ul>
        <p className="text-[13.5px] leading-relaxed text-muted">
          You&apos;re always in control of it — open{" "}
          <Link href="/app/coach" className="font-medium text-accent">the coach</Link> and expand
          &ldquo;What your coach remembers about you&rdquo; to see and edit everything it holds.
        </p>
      </section>

      {/* Reference */}
      <section className="rounded-[var(--radius-card-lg)] border border-line bg-white/50 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Reference</p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Google&apos;s Open Knowledge Format (OKF), introduced June 2026 — a Markdown-and-links standard
          for shareable AI knowledge bases, positioned as an alternative to vector databases for curated
          knowledge. Overviews:{" "}
          <a
            href="https://www.analyticsvidhya.com/blog/2026/07/open-knowledge-format-okf/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            Analytics Vidhya
          </a>{" "}
          ·{" "}
          <a
            href="https://www.mindstudio.ai/blog/what-is-open-knowledge-format-okf-google-llm-wiki-standard"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            MindStudio
          </a>.
        </p>
      </section>
    </div>
  );
}
