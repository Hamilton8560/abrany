"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "./icons";

/* ── beat content (from Figma nodes 21-2 / 21-35 / 21-68 / 21-101) ── */
type Variant = "light" | "dark";
type Pos = "bottom-left" | "right" | "top-left" | "bottom-right";

interface Beat {
  n: string;
  region: string;
  title: [string, string];
  copy: string;
  variant: Variant;
  pos: Pos;
  /* brain transform when this beat is centered (fractions of viewport) */
  scale: number;
  x: number;
  y: number;
  /* hotspot screen position (fraction of stage) */
  hx: number;
  hy: number;
  /* ghost numeral corner */
  ghost: "tl" | "bl";
}

const BEATS: Beat[] = [
  {
    n: "01",
    region: "PREFRONTAL CORTEX",
    title: ["Sharpen your", "focus"],
    copy: "Daily drills that build sustained attention and deep-work stamina.",
    variant: "light",
    pos: "bottom-left",
    scale: 1.9,
    x: 0.04,
    y: -0.03,
    hx: 0.48,
    hy: 0.42,
    ghost: "tl",
  },
  {
    n: "02",
    region: "HIPPOCAMPUS",
    title: ["Remember", "everything"],
    copy: "Spaced-recall training that encodes and retrieves memory faster.",
    variant: "dark",
    pos: "right",
    scale: 2.3,
    x: 0.03,
    y: 0.05,
    hx: 0.45,
    hy: 0.48,
    ghost: "bl",
  },
  {
    n: "03",
    region: "AMYGDALA",
    title: ["Calm under", "pressure"],
    copy: "Regulation exercises that lower reactivity and steady your stress response.",
    variant: "light",
    pos: "top-left",
    scale: 2.75,
    x: 0.08,
    y: 0.08,
    hx: 0.43,
    hy: 0.55,
    ghost: "bl",
  },
  {
    n: "04",
    region: "CEREBELLUM",
    title: ["React in", "a blink"],
    copy: "Reflex and flow tasks that sharpen reaction speed and coordination.",
    variant: "light",
    pos: "bottom-right",
    scale: 2.35,
    x: -0.14,
    y: 0.04,
    hx: 0.64,
    hy: 0.66,
    ghost: "tl",
  },
];

/* anchor progress (0..1) for establish + 4 beats */
const ANCHORS = [0.0, 0.24, 0.48, 0.72, 0.94];
const ESTABLISH = { scale: 1.0, x: 0, y: 0 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/* ── panel positioning ──────────────────────────────────────── */
const POS_CLASS: Record<Pos, string> = {
  "bottom-left": "left-6 md:left-20 bottom-[11%]",
  right: "right-6 md:right-20 top-1/2 -translate-y-1/2",
  "top-left": "left-6 md:left-20 top-[19%]",
  "bottom-right": "right-6 md:right-20 bottom-[11%]",
};

function FeaturePanel({ beat }: { beat: Beat }) {
  const dark = beat.variant === "dark";
  return (
    <div
      className={`${dark ? "glass-dark" : "glass"} w-[min(430px,86vw)] rounded-[20px] p-[26px]`}
    >
      <div className="flex items-center gap-1 text-[13px]">
        <span className={`font-semibold ${dark ? "text-white" : "text-ink"}`}>
          {beat.n}
        </span>
        <span className={dark ? "text-white/55" : "text-muted"}>/ 04</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="h-[2px] w-[22px] bg-accent" />
        <span
          className="text-[12px] font-medium text-accent"
          style={{ letterSpacing: "1.5px" }}
        >
          {beat.region}
        </span>
      </div>

      <h3
        className={`mt-3 font-display font-extrabold [font-size:clamp(30px,3.4vw,40px)] [line-height:1.05] [letter-spacing:-0.01em] ${
          dark ? "text-white" : "text-ink"
        }`}
      >
        {beat.title[0]}
        <br />
        {beat.title[1]}
      </h3>

      <p
        className={`mt-4 max-w-[340px] text-[14.5px] leading-[1.5] ${
          dark ? "text-white/70" : "text-muted"
        }`}
      >
        {beat.copy}
      </p>

      <a
        href="#footer"
        className="group mt-6 inline-flex items-center gap-2 text-[14px] font-semibold text-accent"
      >
        Train this
        <ArrowRight className="size-[14px] transition-transform duration-300 group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}

function Hotspot() {
  return (
    <div className="relative grid place-items-center">
      <span className="absolute size-[58px] rounded-full border border-white/90" />
      <span className="anim-hotspot absolute size-[58px] rounded-full border border-white/70" />
      <span className="size-[12px] rounded-full bg-accent shadow-[0_0_16px_6px_rgba(255,66,38,0.6)]" />
    </div>
  );
}

function GhostNumeral({ beat, className = "" }: { beat: Beat; className?: string }) {
  return (
    <span
      className={`pointer-events-none select-none font-display font-black leading-[0.8] text-ink/[0.05] [font-size:clamp(180px,34vw,460px)] ${className}`}
    >
      {beat.n}
    </span>
  );
}

/* ── the brain that zooms/pans (image-scale fallback for video) ── */
function BrainStage({ brainRef }: { brainRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={brainRef}
      className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(80vh,94vw)] -translate-x-1/2 -translate-y-1/2 will-change-transform"
      style={{ transformOrigin: "center center" }}
    >
      {/* halo */}
      <div
        className="absolute inset-[8%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,120,70,0.14) 0%, rgba(255,120,70,0) 62%)",
        }}
      />
      <Image
        src="/brain.png"
        alt="Anatomical brain fly-through"
        fill
        sizes="90vw"
        className="brain-blend object-contain"
        style={{ filter: "drop-shadow(0 26px 55px rgba(26,36,54,0.20))" }}
      />
    </div>
  );
}

export default function BrainJourney() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const brainRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mode, setMode] = useState<"static" | "scroll">("static");

  useEffect(() => {
    const mq = window.matchMedia(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)"
    );
    if (!mq.matches) {
      setMode("static");
      return;
    }
    setMode("scroll");

    let ctx: { revert: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const gsapMod = await import("gsap");
      const stMod = await import("gsap/ScrollTrigger");
      if (cancelled) return;
      const gsap = gsapMod.default;
      const ScrollTrigger = stMod.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const brain = brainRef.current!;
      const beats = beatRefs.current;
      const hots = hotRefs.current;
      const vw = () => window.innerWidth;
      const vh = () => window.innerHeight;

      const setBrain = (p: number) => {
        // find surrounding anchors
        let i = 0;
        while (i < ANCHORS.length - 1 && p > ANCHORS[i + 1]) i++;
        const states = [ESTABLISH, ...BEATS];
        const a = states[i];
        const b = states[Math.min(i + 1, states.length - 1)];
        const span = ANCHORS[Math.min(i + 1, ANCHORS.length - 1)] - ANCHORS[i] || 1;
        const t = smooth(clamp01((p - ANCHORS[i]) / span));
        const scale = lerp(a.scale, b.scale, t);
        const x = lerp(a.x, b.x, t) * vw();
        const y = lerp(a.y, b.y, t) * vh();
        gsap.set(brain, { scale, x, y, force3D: true });
      };

      const setBeats = (p: number) => {
        BEATS.forEach((beat, idx) => {
          const anchor = ANCHORS[idx + 1];
          // triangular visibility window around the anchor
          const halfIn = 0.11;
          const halfOut = 0.11;
          let o = 0;
          if (p <= anchor) o = clamp01((p - (anchor - halfIn)) / halfIn);
          else o = clamp01(1 - (p - anchor) / halfOut);
          o = smooth(clamp01(o));
          const el = beats[idx];
          const hot = hots[idx];
          if (el) {
            el.style.opacity = String(o);
            el.style.transform = `translateY(${(1 - o) * 26}px)`;
            el.style.pointerEvents = o > 0.6 ? "auto" : "none";
          }
          if (hot) hot.style.opacity = String(smooth(clamp01(o * 1.1)));
        });
      };

      // initialise
      setBrain(0);
      setBeats(0);

      const st = ScrollTrigger.create({
        trigger: sectionRef.current!,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
        onUpdate: (self) => {
          setBrain(self.progress);
          setBeats(self.progress);
        },
        invalidateOnRefresh: true,
      });

      ctx = {
        revert: () => {
          st.kill();
          gsap.set(brain, { clearProps: "transform" });
        },
      };
      ScrollTrigger.refresh();
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  /* ───────── SCROLL MODE (pinned sticky stage) ───────── */
  if (mode === "scroll") {
    return (
      <section ref={sectionRef} className="relative" style={{ height: "500vh" }}>
        <div
          ref={stageRef}
          className="sticky top-0 h-screen w-full overflow-hidden"
        >
          <BrainStage brainRef={brainRef} />

          {/* hotspots */}
          {BEATS.map((beat, i) => (
            <div
              key={`hot-${beat.n}`}
              ref={(el) => {
                hotRefs.current[i] = el;
              }}
              className="absolute"
              style={{
                left: `${beat.hx * 100}%`,
                top: `${beat.hy * 100}%`,
                transform: "translate(-50%,-50%)",
                opacity: 0,
              }}
            >
              <Hotspot />
            </div>
          ))}

          {/* panels */}
          {BEATS.map((beat, i) => (
            <div
              key={`panel-${beat.n}`}
              ref={(el) => {
                beatRefs.current[i] = el;
              }}
              className={`absolute ${POS_CLASS[beat.pos]}`}
              style={{ opacity: 0 }}
            >
              <div className="relative">
                <GhostNumeral
                  beat={beat}
                  className={`absolute ${
                    beat.ghost === "tl"
                      ? "-left-4 -top-[42%]"
                      : "-left-4 top-[60%]"
                  } -z-10`}
                />
                <FeaturePanel beat={beat} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* ───────── STATIC MODE (mobile / reduced-motion) ───────── */
  return (
    <section className="relative">
      {BEATS.map((beat) => (
        <div
          key={`static-${beat.n}`}
          className="relative flex min-h-[92vh] items-center overflow-hidden py-16"
        >
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[135vw] max-w-[720px] -translate-x-1/2 -translate-y-[46%]"
          >
            <Image
              src="/brain.png"
              alt="Anatomical brain region"
              fill
              sizes="135vw"
              className="brain-blend object-contain"
            />
          </div>
          <span
            className={`pointer-events-none absolute select-none font-display font-black leading-[0.8] text-ink/[0.05] [font-size:34vw] ${
              beat.ghost === "tl" ? "left-1 top-[6%]" : "left-1 bottom-[2%]"
            }`}
          >
            {beat.n}
          </span>
          <div className={`relative z-10 w-full px-6`}>
            <FeaturePanel beat={beat} />
          </div>
        </div>
      ))}
    </section>
  );
}
