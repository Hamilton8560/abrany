"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from "react";

/* ───────────────────────────────────────────────────────────
   Liquid Glass — Apple-style refractive glass with CSS + an
   SVG feDisplacementMap (no WebGL). A per-element rounded-rect
   refraction map bends the backdrop at the rim; a specular
   highlight + inner bevel sell the "liquid" edge.
   Chromium samples the map through backdrop-filter; Safari/FF
   gracefully fall back to a frosted blur.
   ─────────────────────────────────────────────────────────── */

/** rounded-rect signed distance ( <0 inside ) */
function sdf(px: number, py: number, w: number, h: number, r: number) {
  const qx = Math.abs(px - w / 2) - (w / 2 - r);
  const qy = Math.abs(py - h / 2) - (h / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** displacement map: inward refraction concentrated in the bezel band */
function makeMap(w: number, h: number, radius: number, bezel: number) {
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = sdf(x + 0.5, y + 0.5, w, h, radius);
      const dist = -s; // >0 inside, = distance from the edge
      let nx = 0;
      let ny = 0;
      let mag = 0;
      if (dist >= 0 && dist < bezel) {
        const gx = sdf(x + 1, y, w, h, radius) - sdf(x - 1, y, w, h, radius);
        const gy = sdf(x, y + 1, w, h, radius) - sdf(x, y - 1, w, h, radius);
        const gl = Math.hypot(gx, gy) || 1;
        nx = gx / gl; // outward normal → barrel/lens magnification at rim
        ny = gy / gl;
        const t = dist / bezel; // 0 at edge → 1 at inner bezel
        mag = Math.pow(1 - t, 1.7);
      }
      const i = (y * w + x) * 4;
      d[i] = 128 + nx * mag * 127;
      d[i + 1] = 128 + ny * mag * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cvs.toDataURL();
}

interface Props {
  children: ReactNode;
  radius?: number;
  bezel?: number;
  scale?: number; // max edge displacement in px
  blur?: number;
  variant?: "light" | "dark";
  className?: string;
  style?: CSSProperties;
}

export default function LiquidGlass({
  children,
  radius = 20,
  bezel = 20,
  scale = 42,
  blur = 2,
  variant = "light",
  className = "",
  style,
}: Props) {
  const rawId = useId().replace(/:/g, "");
  const fid = `lg-${rawId}`;
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<string>();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const w = Math.max(2, Math.round(r.width));
        const h = Math.max(2, Math.round(r.height));
        if (w === size.w && h === size.h) return;
        setSize({ w, h });
        setMap(makeMap(w, h, radius, bezel));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [radius, bezel, size.w, size.h]);

  const dark = variant === "dark";
  const chroma = Math.max(3, Math.round(scale * 0.16));

  return (
    <div
      ref={ref}
      className={`lg ${className}`}
      style={{ borderRadius: radius, ...style }}
    >
      {map && (
        <svg width="0" height="0" aria-hidden className="lg-defs">
          <filter
            id={fid}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={size.w}
            height={size.h}
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={map}
              x="0"
              y="0"
              width={size.w}
              height={size.h}
              result="m"
              preserveAspectRatio="none"
            />
            {/* chromatic aberration: displace R/G/B by different amounts */}
            <feDisplacementMap in="SourceGraphic" in2="m" scale={scale + chroma} xChannelSelector="R" yChannelSelector="G" result="rD" />
            <feDisplacementMap in="SourceGraphic" in2="m" scale={scale} xChannelSelector="R" yChannelSelector="G" result="gD" />
            <feDisplacementMap in="SourceGraphic" in2="m" scale={scale - chroma} xChannelSelector="R" yChannelSelector="G" result="bD" />
            <feColorMatrix in="rD" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rC" />
            <feColorMatrix in="gD" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gC" />
            <feColorMatrix in="bD" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bC" />
            <feBlend in="rC" in2="gC" mode="screen" result="rg" />
            <feBlend in="rg" in2="bC" mode="screen" />
          </filter>
        </svg>
      )}

      <span
        aria-hidden
        className={`lg-surface ${dark ? "lg-dark" : "lg-light"}`}
        style={{
          borderRadius: radius,
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur + 10}px)`,
          ...(map ? { backdropFilter: `blur(${blur}px) url(#${fid})` } : {}),
        }}
      />
      <span aria-hidden className="lg-specular" style={{ borderRadius: radius }} />
      <div className="lg-content">{children}</div>
    </div>
  );
}
