import { BrainGlyph } from "@/components/icons";

/**
 * Deterministic, on-brand book cover: dark ink canvas, the real glowing brain,
 * Archivo display title. The accent tone varies per title (stable hash) so a
 * shelf of books reads as a family without every cover being identical.
 */
const TONES = [
  ["#ff4326", "#ff8a3d"], // ember (brand)
  ["#ff6a3d", "#ffb15c"], // amber
  ["#ff3d5e", "#ff7a3d"], // coral
  ["#e8452e", "#ffa14e"], // flame
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export default function BookCover({
  title,
  author,
  className = "",
}: {
  title: string;
  author?: string;
  className?: string;
}) {
  const [c1, c2] = TONES[hash(title) % TONES.length];
  const big = title.length <= 26;
  return (
    <div
      className={`relative flex aspect-[2/3] w-full flex-col overflow-hidden rounded-[10px] text-white shadow-[var(--shadow-card)] ${className}`}
      style={{ background: "linear-gradient(160deg,#232e45 0%,#1b2436 45%,#141b2a 100%)", containerType: "inline-size" }}
    >
      {/* glowing brain, screen-blended into the dark canvas */}
      <img
        src="/brain.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[48%] w-[105cqw] -translate-x-1/2 -translate-y-1/2 mix-blend-screen"
        style={{ opacity: 0.85 }}
      />
      {/* accent glow wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(80cqw 60cqw at 50% 55%, ${c1}26 0%, transparent 70%)` }}
      />
      {/* spine hint */}
      <div className="absolute inset-y-0 left-0 w-[3.5cqw] bg-black/30" />
      {/* top brand row */}
      <div className="relative z-10 flex items-center justify-between px-[8cqw] pt-[7cqw]">
        <div className="flex items-center" style={{ gap: "3cqw" }}>
          <BrainGlyph style={{ width: "7cqw", height: "7cqw" }} />
          <span className="font-display font-extrabold" style={{ fontSize: "4.6cqw", letterSpacing: "0.9cqw" }}>
            ABRANY
          </span>
        </div>
        <span className="rounded-full border border-white/25 px-[3.4cqw] py-[1.2cqw] font-medium text-white/70" style={{ fontSize: "2.9cqw", letterSpacing: "0.35cqw" }}>
          AI-CRAFTED
        </span>
      </div>
      {/* title block, anchored low like a real cover */}
      <div className="relative z-10 mt-auto flex flex-col px-[8cqw] pb-[8cqw]">
        <div className="mb-[3.5cqw] h-[1cqw] w-[14cqw] rounded-full" style={{ background: `linear-gradient(90deg,${c1},${c2})` }} />
        <h3
          className="font-display font-extrabold uppercase leading-[1.04]"
          style={{ fontSize: big ? "9.4cqw" : "7.2cqw", textShadow: "0 2px 24px rgba(0,0,0,.45)" }}
        >
          {title}
        </h3>
        {author && (
          <p className="mt-[3cqw] font-medium text-white/75" style={{ fontSize: "3.6cqw", letterSpacing: "0.25cqw" }}>
            {author}
          </p>
        )}
      </div>
    </div>
  );
}
