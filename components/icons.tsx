import type { SVGProps } from "react";

/* ABRANY neural-node glyph — used in the logo badge and CTA button */
export function BrainGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M12 3.2c-2.1 0-3.6 1.3-3.9 3-1.7.3-2.9 1.7-2.9 3.5 0 1 .4 1.9 1.1 2.5-.2.4-.3.9-.3 1.4 0 1.8 1.4 3.2 3.3 3.4.4 1.5 1.8 2.6 3.6 2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 3.2c2.1 0 3.6 1.3 3.9 3 1.7.3 2.9 1.7 2.9 3.5 0 1-.4 1.9-1.1 2.5.2.4.3.9.3 1.4 0 1.8-1.4 3.2-3.3 3.4-.4 1.5-1.8 2.6-3.6 2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6v13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}

export function ArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M2.5 8h11M9 3.5 13.5 8 9 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 22 24" fill="none" aria-hidden {...props}>
      <path d="M3 2.5 19 12 3 21.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

export function ChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UpArrow(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 10 10" fill="none" aria-hidden {...props}>
      <path
        d="M5 8.5v-7M2 4.5 5 1.5 8 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sparkline(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 158 34" fill="none" preserveAspectRatio="none" aria-hidden {...props}>
      <path
        d="M1 22c14 0 18-13 30-13s16 15 29 15 18-19 32-19 17 11 30 11 5-9 5-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* radial gauge for the "345 sessions" card */
export function Gauge({ size = 56 }: { size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const pct = 0.68;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M2 2l12 12M14 2 2 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="4" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M3 6.5v6M3 3.6v.02M6.5 12.5v-3.2c0-1 .7-1.8 1.8-1.8s1.7.8 1.7 1.8v3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
