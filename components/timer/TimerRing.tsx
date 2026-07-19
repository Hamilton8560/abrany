/* circular countdown ring — the arc shows time remaining */
export default function TimerRing({
  size = 40,
  stroke = 4,
  fraction,
  color = "var(--color-accent)",
  track = "rgba(27, 36, 54, 0.12)",
}: {
  size?: number;
  stroke?: number;
  /** remaining fraction of the phase, 0..1 */
  fraction: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={track}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.25s linear" }}
      />
    </svg>
  );
}
