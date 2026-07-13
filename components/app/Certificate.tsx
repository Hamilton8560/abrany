import { BrainGlyph, CheckIcon } from "@/components/icons";

export type CertData = {
  id: string;
  recipientName: string;
  title: string;
  sectionsTotal: number;
  sectionsDone: number;
  minutesTotal: number;
  overall: string;
  issuedAt: string;
  verifyUrl: string;
};

const fmtDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const timeLabel = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)} hrs` : `${min} min`);

/**
 * On-brand certificate of completion. Sized with container-query units (cqw) so
 * it scales perfectly from a phone to a print sheet. Drop it in a container of
 * any width; everything tracks that width.
 */
export default function Certificate({ c }: { c: CertData }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[2cqw] border border-line bg-[#fcfdfe] text-ink shadow-[var(--shadow-card)]"
      style={{ aspectRatio: "1200 / 850", containerType: "inline-size" }}
    >
      {/* real brain, multiply so its light background drops out */}
      <img
        src="/brain.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[15%] w-[46cqw] -translate-x-1/2 mix-blend-multiply"
        style={{ opacity: 0.4 }}
      />
      {/* double border */}
      <div className="absolute rounded-[1.4cqw] border border-accent/50" style={{ inset: "2.4cqw" }} />
      <div className="absolute rounded-[1cqw] border border-line" style={{ inset: "3.3cqw" }} />

      {/* top content */}
      <div className="absolute inset-x-0 flex flex-col items-center text-center" style={{ top: "8.5cqw", gap: "1.7cqw" }}>
        <div className="flex items-center" style={{ gap: "1cqw" }}>
          <span className="grid place-items-center rounded-full bg-ink text-white" style={{ width: "4.6cqw", height: "4.6cqw" }}>
            <BrainGlyph style={{ width: "2.6cqw", height: "2.6cqw" }} />
          </span>
          <span className="font-display font-extrabold" style={{ fontSize: "2cqw", letterSpacing: "0.2cqw" }}>ABRANY</span>
        </div>
        <p className="font-display font-bold text-accent" style={{ fontSize: "1.15cqw", letterSpacing: "0.34cqw" }}>
          CERTIFICATE OF COMPLETION
        </p>
        <div className="flex flex-col items-center" style={{ gap: "0.4cqw" }}>
          <p className="text-muted" style={{ fontSize: "1.35cqw" }}>This certifies that</p>
          <p className="font-display font-extrabold leading-[1]" style={{ fontSize: "5.2cqw" }}>{c.recipientName}</p>
          <p className="text-muted" style={{ fontSize: "1.35cqw" }}>has successfully completed</p>
        </div>
        <p className="font-display font-semibold" style={{ fontSize: "2.4cqw" }}>{c.title}</p>
      </div>

      {/* metrics */}
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ bottom: "26cqw", gap: "3.8cqw" }}>
        {[
          [fmtDate(c.issuedAt), "DATE ISSUED"],
          [`${c.sectionsDone} / ${c.sectionsTotal}`, "SECTIONS COMPLETED"],
          [timeLabel(c.minutesTotal), "TIME INVESTED"],
        ].map(([v, l], i) => (
          <div key={i} className="flex items-center" style={{ gap: "3.8cqw" }}>
            {i > 0 && <span className="bg-line" style={{ width: "0.08cqw", height: "3.3cqw" }} />}
            <div className="flex flex-col items-center" style={{ gap: "0.35cqw" }}>
              <span className="font-display font-semibold" style={{ fontSize: "1.65cqw" }}>{v}</span>
              <span className="font-medium text-muted" style={{ fontSize: "0.92cqw", letterSpacing: "0.13cqw" }}>{l}</span>
            </div>
          </div>
        ))}
      </div>

      {/* seal */}
      <div className="absolute flex flex-col items-center" style={{ left: "11cqw", bottom: "6cqw", gap: "1cqw" }}>
        <span
          className="grid place-items-center rounded-full text-white"
          style={{ width: "8cqw", height: "8cqw", background: "linear-gradient(135deg,#ff4326,#ff8a3d)", boxShadow: "0 0.6cqw 1.6cqw rgba(255,66,38,.4)" }}
        >
          <CheckIcon style={{ width: "3.4cqw", height: "3.4cqw" }} />
        </span>
        <span className="font-display font-bold text-accent" style={{ fontSize: "0.92cqw", letterSpacing: "0.18cqw" }}>
          VERIFIED CREDENTIAL
        </span>
      </div>

      {/* signature */}
      <div className="absolute flex flex-col items-center" style={{ right: "9cqw", bottom: "8cqw", gap: "0.5cqw" }}>
        <span className="font-display italic" style={{ fontSize: "2.5cqw" }}>Abrany</span>
        <span className="bg-ink/50" style={{ width: "20cqw", height: "0.12cqw" }} />
        <span className="text-muted" style={{ fontSize: "1.05cqw" }}>Abrany · AI Training Coach</span>
      </div>

      {/* credential + verify */}
      <p className="absolute inset-x-0 text-center text-muted" style={{ bottom: "2.4cqw", fontSize: "0.95cqw" }}>
        Credential ID {c.id} &nbsp;·&nbsp; Verify at {c.verifyUrl.replace(/^https?:\/\//, "")}
      </p>
    </div>
  );
}
