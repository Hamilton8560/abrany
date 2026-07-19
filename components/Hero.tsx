"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  BrainGlyph,
  ArrowRight,
  PlayIcon,
  ChevronDown,
  UpArrow,
  Gauge,
  Sparkline,
} from "./icons";
import LiquidGlass from "./LiquidGlass";

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.1 },
  },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const fade: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ── shared building blocks ─────────────────────────────────── */

function StartTrainingPill() {
  return (
    <Link
      href="/app"
      className="glassx group inline-flex items-center gap-[14px] rounded-full py-[7px] pl-[7px] pr-[7px] shadow-[var(--shadow-cta)] transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span className="glassx-dark grid size-[42px] place-items-center rounded-full text-white">
        <BrainGlyph className="size-[18px]" />
      </span>
      <span className="text-[15px] font-semibold text-ink">Start Training</span>
      <span className="glassx grid size-[42px] place-items-center rounded-full text-ink transition-transform duration-300 group-hover:translate-x-0.5">
        <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}

function Avatars() {
  const grads = [
    "linear-gradient(135deg,#ffb08a,#ff6b3d)",
    "linear-gradient(135deg,#b9a3ff,#7b61ff)",
    "linear-gradient(135deg,#8ad0ff,#3d8bff)",
    "linear-gradient(135deg,#ffd88a,#ff9f43)",
  ];
  return (
    <div className="flex">
      {grads.map((g, i) => (
        <span
          key={i}
          className="size-[26px] rounded-full ring-2 ring-white"
          style={{ background: g, marginLeft: i === 0 ? 0 : -11 }}
        />
      ))}
    </div>
  );
}

function CardActiveLearners() {
  return (
    <LiquidGlass radius={16} bezel={14} scale={24}>
      <div className="flex items-center gap-[10px] py-[11px] pl-[14px] pr-[16px]">
        <Avatars />
        <div className="leading-none">
          <p className="text-[15px] font-semibold text-ink">544+</p>
          <p className="mt-[2px] text-[10px] text-muted">Active Learners</p>
        </div>
      </div>
    </LiquidGlass>
  );
}

function CardSessions() {
  return (
    <LiquidGlass radius={18} bezel={16} scale={30}>
      <div className="flex w-[180px] flex-col gap-3 px-4 py-[15px]">
      <div className="flex items-center gap-3">
        <Gauge size={56} />
        <div className="leading-none">
          <p className="text-[22px] font-semibold text-ink">345</p>
          <p className="mt-[2px] text-[10px] text-muted">sessions tracked</p>
        </div>
      </div>
      <div className="h-px w-full bg-line" />
      <div className="flex gap-[18px]">
        <div className="leading-none">
          <p className="text-[14px] font-semibold text-ink">24K</p>
          <p className="mt-[2px] text-[9px] text-muted">data points</p>
        </div>
        <div className="leading-none">
          <div className="flex items-center gap-1">
            <p className="text-[14px] font-semibold text-ink">1.33</p>
            <UpArrow className="size-[10px] text-up" />
          </div>
          <p className="mt-[2px] text-[9px] text-muted">avg score</p>
        </div>
      </div>
      </div>
    </LiquidGlass>
  );
}

function CardNeuralInsights() {
  return (
    <LiquidGlass radius={18} bezel={16} scale={30}>
      <div className="flex w-[186px] flex-col gap-[10px] px-[14px] py-[13px]">
      <div className="flex items-center gap-[10px]">
        <span
          className="size-[34px] rounded-[10px]"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, #ffffff 0%, #ffd9c4 25%, #ffb28a 50%, #ff8f63 75%, #ff6b3d 100%)",
          }}
        />
        <div className="leading-none">
          <p className="text-[10px] text-muted">Neural</p>
          <p className="mt-[2px] text-[14px] font-semibold text-ink">Insights</p>
        </div>
      </div>
      <Sparkline className="h-[34px] w-full text-accent" />
      </div>
    </LiquidGlass>
  );
}

function PlayButton() {
  return (
    <button
      type="button"
      aria-label="Play intro"
      className="anim-bob rounded-full shadow-[var(--shadow-glow)] transition-transform duration-300 hover:scale-105"
    >
      <LiquidGlass
        radius={39}
        bezel={18}
        scale={30}
        className="grid size-[78px] place-items-center"
      >
        <PlayIcon className="ml-1 h-6 w-[22px] text-ink/85" />
      </LiquidGlass>
    </button>
  );
}

/* ── the anatomical brain (blends onto the gradient) ────────── */
function Brain({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brain.png"
      alt="Anatomical brain with glowing neural pathways"
      width={1024}
      height={1024}
      priority={priority}
      className={`brain-blend select-none ${className}`}
      style={{ filter: "drop-shadow(0 26px 55px rgba(26,36,54,0.22))" }}
    />
  );
}

/* ─────────────────────────────────────────────────────────── */

export default function Hero() {
  const reduce = useReducedMotion();

  const Eyebrow = (
    <div className="flex items-center gap-3">
      <span className="h-[2px] w-[26px] bg-accent" />
      <span
        className="text-[12px] font-medium text-accent"
        style={{ letterSpacing: "1.68px" }}
      >
        NEURO-TRAINING PLATFORM
      </span>
    </div>
  );

  const Headline = (
    <h1 className="font-display font-extrabold uppercase text-ink [font-size:clamp(44px,7vw,64px)] [line-height:0.95] [letter-spacing:-0.01em]">
      <span className="block">First</span>
      <span className="block">Personal</span>
      <span className="block text-brain-muted">Brain</span>
      <span className="block">Trainer</span>
    </h1>
  );

  const Subcopy = (
    <p className="max-w-[300px] text-[14.5px] leading-[1.58] text-muted">
      Train your mind with precision, adapt in real time, and unlock measurable
      cognitive performance.
    </p>
  );

  return (
    <section id="top" className="relative overflow-hidden">
      {/* ───────── desktop / tablet-landscape ───────── */}
      <div className="mx-auto hidden min-h-[860px] max-w-[1440px] items-center px-20 pt-[120px] pb-[80px] lg:flex">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid w-full grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-center gap-8"
        >
          {/* left copy */}
          <div className="flex flex-col gap-6">
            <motion.div variants={rise}>{Eyebrow}</motion.div>
            <motion.div variants={rise}>{Headline}</motion.div>
            <motion.div variants={rise}>{Subcopy}</motion.div>
            <motion.div variants={rise}>
              <StartTrainingPill />
            </motion.div>
          </div>

          {/* right brain cluster */}
          <motion.div variants={fade} className="relative h-[620px]">
            {/* soft radial halo behind brain */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,120,70,0.16) 0%, rgba(255,120,70,0) 62%)",
              }}
            />
            <Brain
              priority
              className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2"
            />

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <PlayButton />
            </div>

            <motion.div
              variants={fade}
              className={`absolute left-[14%] top-[2%] ${reduce ? "" : "anim-float"}`}
              style={{ animationDelay: "0s" }}
            >
              <CardActiveLearners />
            </motion.div>

            <motion.div
              variants={fade}
              className={`absolute right-0 top-[24%] ${reduce ? "" : "anim-float"}`}
              style={{ animationDelay: "1.1s" }}
            >
              <CardSessions />
            </motion.div>

            <motion.div
              variants={fade}
              className={`absolute left-0 bottom-[10%] ${reduce ? "" : "anim-float"}`}
              style={{ animationDelay: "0.5s" }}
            >
              <CardNeuralInsights />
            </motion.div>

            <motion.div
              variants={rise}
              className="absolute bottom-[2%] right-[6%] text-right text-[12px] font-semibold leading-[1.28] text-muted"
              style={{ letterSpacing: "1.68px" }}
            >
              YOUR
              <br />
              MIND
              <br />
              UPGRADED
            </motion.div>
          </motion.div>
        </motion.div>

        {/* pager */}
        <div className="absolute bottom-[38px] left-20 flex items-center gap-3">
          <span
            className="text-[12px] font-semibold text-ink"
            style={{ letterSpacing: "0.96px" }}
          >
            01
          </span>
          <span className="h-[1.5px] w-[34px] bg-muted/50" />
          <span
            className="text-[12px] text-muted"
            style={{ letterSpacing: "0.96px" }}
          >
            02
          </span>
        </div>

        {/* scroll cue */}
        <div className="absolute bottom-[36px] left-1/2 flex -translate-x-1/2 items-center gap-2 text-muted">
          <span className="text-[11px] font-medium" style={{ letterSpacing: "1.98px" }}>
            SCROLL TO EXPLORE
          </span>
          <ChevronDown className={`size-3 ${reduce ? "" : "anim-bob"}`} />
        </div>
      </div>

      {/* ───────── mobile ───────── */}
      <div className="flex flex-col px-6 pt-[96px] pb-14 lg:hidden">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-6"
        >
          <motion.div variants={rise}>{Eyebrow}</motion.div>
          <motion.div variants={rise}>{Headline}</motion.div>
          <motion.div variants={rise}>{Subcopy}</motion.div>
          <motion.div variants={rise}>
            <StartTrainingPill />
          </motion.div>

          <motion.div variants={fade} className="relative mx-auto mt-2 h-[330px] w-full max-w-[360px]">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,120,70,0.16) 0%, rgba(255,120,70,0) 62%)",
              }}
            />
            <Brain
              priority
              className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2"
            />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <PlayButton />
            </div>
          </motion.div>

          <motion.div
            variants={rise}
            className="mt-2 grid grid-cols-3 divide-x divide-line rounded-[16px]"
          >
            {[
              ["544+", "Active"],
              ["345", "Sessions"],
              ["24K", "Data pts"],
            ].map(([n, l]) => (
              <div key={l} className="flex flex-col items-center py-1">
                <span className="text-[21px] font-semibold text-ink">{n}</span>
                <span className="text-[12px] text-muted">{l}</span>
              </div>
            ))}
          </motion.div>

          <div className="mt-2 flex items-center justify-center gap-2 text-muted">
            <span className="text-[11px] font-medium" style={{ letterSpacing: "1.98px" }}>
              SCROLL TO EXPLORE
            </span>
            <ChevronDown className={`size-3 ${reduce ? "" : "anim-bob"}`} />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
