"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "./icons";
import LiquidGlass from "./LiquidGlass";

/* ───────────────────────────────────────────────────────────
   BRAIN JOURNEY — scroll-scrubbed fly-through.
   The scroll IS the playhead: a pre-decoded WebP frame sequence
   (extracted from the Higgsfield film) is painted to a <canvas>.
   NEVER scrub a <video>.currentTime — decoded frames blit instantly.
   Captions LOCK on the 4 region frames (0.25 / 0.5 / 0.75 / 1.0).
   ─────────────────────────────────────────────────────────── */

const FRAME_COUNT = 202;
const framePath = (i: number) =>
  `/frames/f_${String(i).padStart(3, "0")}.webp`;

type Variant = "light" | "dark";
type Pos = "bottom-left" | "right" | "top-left" | "bottom-right";

interface Beat {
  n: string;
  region: string;
  title: [string, string];
  copy: string;
  variant: Variant;
  pos: Pos;
  ghost: "tl" | "bl";
  still: string; // region keyframe for static fallback
  lock: number; // videoProgress the film locks on
}

const BEATS: Beat[] = [
  {
    n: "01",
    region: "PREFRONTAL CORTEX",
    title: ["Sharpen your", "focus"],
    copy: "Daily drills that build sustained attention and deep-work stamina.",
    variant: "light",
    pos: "bottom-left",
    ghost: "tl",
    still: "/regions/prefrontal.webp",
    lock: 0.25,
  },
  {
    n: "02",
    region: "HIPPOCAMPUS",
    title: ["Remember", "everything"],
    copy: "Spaced-recall training that encodes and retrieves memory faster.",
    variant: "dark",
    pos: "right",
    ghost: "bl",
    still: "/regions/hippocampus.webp",
    lock: 0.5,
  },
  {
    n: "03",
    region: "AMYGDALA",
    title: ["Calm under", "pressure"],
    copy: "Regulation exercises that lower reactivity and steady your stress response.",
    variant: "light",
    pos: "top-left",
    ghost: "bl",
    still: "/regions/amygdala.webp",
    lock: 0.75,
  },
  {
    n: "04",
    region: "CEREBELLUM",
    title: ["React in", "a blink"],
    copy: "Reflex and flow tasks that sharpen reaction speed and coordination.",
    variant: "light",
    pos: "bottom-right",
    ghost: "tl",
    still: "/regions/cerebellum.webp",
    lock: 1.0,
  },
];

/* ── travel/lock timeline ───────────────────────────────────── */
type Seg =
  | { type: "travel"; from: number; to: number; w: number }
  | { type: "lock"; at: number; scene: number; w: number };

// clean region end-frames (0-based indices into the frame sequence):
// f_050 prefrontal · f_100 hippocampus · f_150 amygdala · f_200 cerebellum
const LOCK_FRAME = [49, 99, 149, 200];
const LV = LOCK_FRAME.map((f) => f / (FRAME_COUNT - 1));

// travel weight (brain fly-through) is deliberately large so scrubbing the
// motion feels slow/cinematic; locks are shorter holds for the caption.
const TRAVEL_W = 2.1;
const LOCK_W = 0.9;
const TIMELINE: Seg[] = [
  { type: "travel", from: 0.0, to: LV[0], w: TRAVEL_W },
  { type: "lock", at: LV[0], scene: 0, w: LOCK_W },
  { type: "travel", from: LV[0], to: LV[1], w: TRAVEL_W },
  { type: "lock", at: LV[1], scene: 1, w: LOCK_W },
  { type: "travel", from: LV[1], to: LV[2], w: TRAVEL_W },
  { type: "lock", at: LV[2], scene: 2, w: LOCK_W },
  { type: "travel", from: LV[2], to: LV[3], w: TRAVEL_W },
  { type: "lock", at: LV[3], scene: 3, w: 1.05 },
];
const TOTAL_W = TIMELINE.reduce((s, seg) => s + seg.w, 0);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

interface Resolved {
  videoProgress: number;
  scene: number; // active lock scene, -1 during travel
  sceneOpacity: number; // caption opacity for the active scene
}

function resolve(p: number): Resolved {
  const target = clamp01(p) * TOTAL_W;
  const last = TIMELINE[TIMELINE.length - 1];
  let acc = 0;
  for (const seg of TIMELINE) {
    const end = acc + seg.w;
    if (target < end || seg === last) {
      const local = clamp01((target - acc) / seg.w);
      if (seg.type === "travel") {
        return {
          videoProgress: lerp(seg.from, seg.to, local),
          scene: -1,
          sceneOpacity: 0,
        };
      }
      // lock: hold the frame, fade caption in over first 26% / out over last 22%
      let o = 1;
      if (local < 0.26) o = local / 0.26;
      else if (local > 0.78) o = (1 - local) / 0.22;
      return {
        videoProgress: seg.at,
        scene: seg.scene,
        sceneOpacity: smooth(clamp01(o)),
      };
    }
    acc = end;
  }
  return { videoProgress: 1, scene: 3, sceneOpacity: 1 };
}

/* ── caption panel (shared with static fallback) ────────────── */
const POS_CLASS: Record<Pos, string> = {
  "bottom-left": "left-6 md:left-20 bottom-[11%]",
  right: "right-6 md:right-20 top-1/2 -translate-y-1/2",
  "top-left": "left-6 md:left-20 top-[19%]",
  "bottom-right": "right-6 md:right-20 bottom-[11%]",
};

function GhostNumeral({ n, className = "" }: { n: string; className?: string }) {
  return (
    <span
      className={`pointer-events-none select-none font-display font-black leading-[0.8] text-ink/[0.06] [font-size:clamp(180px,32vw,440px)] ${className}`}
    >
      {n}
    </span>
  );
}

function FeaturePanel({ beat }: { beat: Beat }) {
  const dark = beat.variant === "dark";
  return (
    <LiquidGlass
      radius={20}
      bezel={22}
      scale={54}
      blur={14}
      variant={dark ? "dark" : "light"}
      className="w-[min(430px,86vw)]"
    >
      <div className="p-[26px]">
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
    </LiquidGlass>
  );
}

export default function BrainJourney() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mode, setMode] = useState<"static" | "scroll">("static");
  const [loadPct, setLoadPct] = useState(0);
  const [ready, setReady] = useState(false);

  // decide mode after mount (SSR-safe: starts "static").
  // The scroll-scrub fly-through now runs on every viewport, phones
  // included — the only opt-out is an explicit reduced-motion request.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMode(mq.matches ? "static" : "scroll");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // canvas scrubber — runs once the canvas is actually mounted
  useEffect(() => {
    if (mode !== "scroll" || !canvasRef.current) return;

    let raf = 0;
    let disposed = false;
    const frames: HTMLImageElement[] = new Array(FRAME_COUNT);
    let loaded = 0;

    // progressive: load coarse (every 6th) first, then the rest
    const order: number[] = [];
    for (let i = 1; i <= FRAME_COUNT; i += 6) order.push(i);
    for (let i = 1; i <= FRAME_COUNT; i++) if ((i - 1) % 6 !== 0) order.push(i);

    const load = (idx: number) =>
      new Promise<void>((res) => {
        const img = new window.Image();
        img.onload = img.onerror = () => {
          frames[idx - 1] = img;
          loaded++;
          if (!disposed) setLoadPct(Math.round((loaded / FRAME_COUNT) * 100));
          res();
        };
        img.src = framePath(idx);
      });

    // small concurrency pool
    (async () => {
      const POOL = 8;
      let cursor = 0;
      const worker = async () => {
        while (cursor < order.length && !disposed) {
          const idx = order[cursor++];
          await load(idx);
          if (loaded === Math.ceil(FRAME_COUNT / 6)) {
            if (!disposed) setReady(true); // coarse set in — reveal
          }
        }
      };
      await Promise.all(Array.from({ length: POOL }, worker));
      if (!disposed) setReady(true);
    })();

    const getFrame = (i: number): HTMLImageElement | null => {
      const clamped = Math.max(0, Math.min(FRAME_COUNT - 1, i));
      for (let d = 0; d <= FRAME_COUNT; d++) {
        if (frames[clamped + d]) return frames[clamped + d];
        if (frames[clamped - d]) return frames[clamped - d];
      }
      return null;
    };

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let cw = 0,
      ch = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      cw = r.width;
      ch = r.height;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawFrame = (vp: number) => {
      const idx = Math.round(vp * (FRAME_COUNT - 1));
      const img = getFrame(idx);
      if (!img || !img.width) return;
      // cover-fit
      const s = Math.max(cw / img.width, ch / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    };

    let current = 0;
    const tick = () => {
      if (disposed) return;
      const sec = sectionRef.current!;
      const rect = sec.getBoundingClientRect();
      const scrollable = sec.offsetHeight - window.innerHeight;
      const p = clamp01(-rect.top / Math.max(1, scrollable));
      // smooth the playhead
      const state = resolve(p);
      current += (state.videoProgress - current) * 0.16;
      drawFrame(current);

      // captions
      BEATS.forEach((_, i) => {
        const el = capRefs.current[i];
        if (!el) return;
        const o = state.scene === i ? state.sceneOpacity : 0;
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * 24}px)`;
        el.style.pointerEvents = o > 0.6 ? "auto" : "none";
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  /* ───────── SCROLL MODE ───────── */
  if (mode === "scroll") {
    return (
      <section ref={sectionRef} className="relative" style={{ height: `${TOTAL_W * 82}svh` }}>
        <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
          {/* poster while frames decode */}
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: ready ? 0 : 1 }}
          >
            <Image
              src="/regions/establish.webp"
              alt=""
              fill
              priority
              className="object-cover"
            />
          </div>

          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full transition-opacity duration-700"
            style={{ opacity: ready ? 1 : 0 }}
          />

          {/* loading bar */}
          {!ready && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-center">
              <div className="h-[2px] w-40 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${loadPct}%` }}
                />
              </div>
              <p className="mt-3 text-[11px] font-medium tracking-[1.6px] text-muted">
                PREPARING THE FLY-THROUGH
              </p>
            </div>
          )}

          {/* captions */}
          {BEATS.map((beat, i) => (
            <div
              key={beat.n}
              ref={(el) => {
                capRefs.current[i] = el;
              }}
              className={`absolute ${POS_CLASS[beat.pos]}`}
              style={{ opacity: 0 }}
            >
              <div className="relative">
                <GhostNumeral
                  n={beat.n}
                  className={`absolute ${
                    beat.ghost === "tl" ? "-left-4 -top-[42%]" : "-left-4 top-[60%]"
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
          key={beat.n}
          className="relative flex min-h-[92vh] items-center overflow-hidden"
        >
          <Image
            src={beat.still}
            alt={`${beat.region} lit up`}
            fill
            sizes="100vw"
            className="object-cover"
          />
          <span
            className={`pointer-events-none absolute select-none font-display font-black leading-[0.8] text-white/10 [font-size:34vw] ${
              beat.ghost === "tl" ? "left-1 top-[5%]" : "left-1 bottom-[2%]"
            }`}
          >
            {beat.n}
          </span>
          <div className="relative z-10 w-full px-6">
            <FeaturePanel beat={beat} />
          </div>
        </div>
      ))}
    </section>
  );
}
