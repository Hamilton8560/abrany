"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "./Markdown";
import { ArrowRight, BrainGlyph } from "@/components/icons";

/**
 * Renders a markdown deck (slides separated by a `---` line) as a navigable,
 * presentable slideshow — reusing the Markdown renderer, so slides carry
 * headings, bullets, tables, Mermaid and architecture diagrams.
 *
 * Design goals: title slides are centered with brand presence; content slides
 * get an accent-bar heading; diagrams are height-capped so they never overflow
 * the frame; keyboard nav, touch swipe, fullscreen present mode, print-to-PDF.
 */
export default function SlideDeck({ content }: { content: string }) {
  const slides = useMemo(
    () =>
      content
        .split(/\n[ \t]*---[ \t]*\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [content],
  );
  const [i, setI] = useState(0);
  const [fs, setFs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (d: number) => setI((n) => Math.max(0, Math.min(slides.length - 1, n + d))),
    [slides.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, slides.length]);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.();
  };

  if (!slides.length) return <p className="text-[14px] text-muted">This deck is empty.</p>;

  const isTitle = /^#\s/.test(slides[i]);
  const isLast = i === slides.length - 1;

  return (
    <div ref={wrapRef} className={fs ? "flex h-screen flex-col bg-[var(--color-bg-mid)] p-6" : ""}>
      {/* slide surface — 16:9 on desktop, taller on phones */}
      <div className={`relative ${fs ? "flex-1" : ""}`}>
        <div
          className={`glass relative mx-auto flex w-full flex-col overflow-hidden rounded-[var(--radius-card-lg)] ${
            fs ? "h-full" : "aspect-[4/5] sm:aspect-[16/9]"
          }`}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
          }}
        >
          {/* progress bar */}
          <div className="absolute inset-x-0 top-0 z-10 h-[3px] bg-line/50">
            <div
              className="h-full rounded-r-full transition-all duration-300"
              style={{ width: `${((i + 1) / slides.length) * 100}%`, background: "linear-gradient(90deg,#ff4326,#ff8a3d)" }}
            />
          </div>

          {/* slide number chip */}
          {!isTitle && (
            <span className="absolute bottom-3 right-4 z-10 text-[11px] font-medium tabular-nums text-muted/70">
              {i + 1} / {slides.length}
            </span>
          )}

          {isTitle ? (
            /* ── title slide: centered, brand-forward ── */
            <div key={i} className="anim-slide-in relative flex flex-1 flex-col items-center justify-center overflow-hidden px-8 text-center sm:px-16">
              <BrainGlyph className="pointer-events-none absolute -right-16 -top-16 size-[280px] text-ink opacity-[0.05]" />
              <span className="mb-6 grid size-12 place-items-center rounded-full bg-ink text-white sm:size-14">
                <BrainGlyph className="size-6 sm:size-7" />
              </span>
              <div className="mx-auto mb-5 h-[3px] w-12 rounded-full" style={{ background: "linear-gradient(90deg,#ff4326,#ff8a3d)" }} />
              <div className="[&_h1]:font-display [&_h1]:text-[clamp(30px,5vw,54px)] [&_h1]:font-extrabold [&_h1]:uppercase [&_h1]:leading-[1.02] [&_h1]:text-ink [&_em]:mt-4 [&_em]:block [&_em]:text-[clamp(14px,1.8vw,19px)] [&_em]:not-italic [&_em]:text-muted [&_p]:mt-3 [&_p]:text-[clamp(14px,1.8vw,19px)] [&_p]:text-muted">
                <Markdown>{slides[i]}</Markdown>
              </div>
            </div>
          ) : (
            /* ── content slide ── */
            <div
              key={i}
              className={`anim-slide-in flex-1 overflow-y-auto px-7 py-7 sm:px-12 sm:py-9 ${
                isLast ? "[&_h2]:text-accent" : ""
              } [&_h2]:relative [&_h2]:mt-0 [&_h2]:pb-3 [&_h2]:font-display [&_h2]:text-[clamp(22px,2.8vw,34px)] [&_h2]:font-extrabold [&_h2]:leading-[1.08] [&_h2]:text-ink [&_h2]:after:absolute [&_h2]:after:bottom-0 [&_h2]:after:left-0 [&_h2]:after:h-[3px] [&_h2]:after:w-10 [&_h2]:after:rounded-full [&_h2]:after:bg-accent [&_h2]:after:content-[''] [&_h3]:text-[clamp(16px,1.8vw,21px)] [&_li]:text-[clamp(14px,1.5vw,18.5px)] [&_li]:leading-[1.55] [&_p]:text-[clamp(14px,1.5vw,18.5px)] [&_p]:leading-[1.6] [&_ul]:mt-3 [&_ol]:mt-3 [&_li]:mt-1.5 [&_table]:text-[clamp(12.5px,1.3vw,15.5px)] [&_svg]:max-h-[46vh]`}
            >
              <Markdown>{slides[i]}</Markdown>
            </div>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="mt-4 flex items-center justify-between gap-4">
        <button
          onClick={() => go(-1)}
          disabled={i === 0}
          className="glassx grid size-11 place-items-center rounded-full text-ink transition disabled:opacity-40"
          aria-label="Previous slide"
        >
          <ArrowRight className="size-4 rotate-180" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          {slides.length <= 16 && (
            <div className="hidden items-center gap-2 sm:flex">
              {slides.map((_, k) => (
                <button
                  key={k}
                  onClick={() => setI(k)}
                  aria-label={`Slide ${k + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    k === i ? "w-6 bg-accent" : "w-2 bg-line hover:bg-muted"
                  }`}
                />
              ))}
            </div>
          )}
          <span className="text-[12px] tabular-nums text-muted sm:ml-2">
            {i + 1} / {slides.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="glassx hidden rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-ink sm:block"
          >
            PDF
          </button>
          <button
            onClick={toggleFs}
            className="glassx rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-ink"
          >
            {fs ? "Exit" : "Present"}
          </button>
          <button
            onClick={() => go(1)}
            disabled={i === slides.length - 1}
            className="glassx-dark grid size-11 place-items-center rounded-full text-white transition disabled:opacity-40"
            aria-label="Next slide"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
