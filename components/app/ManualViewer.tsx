"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { CheckTarget, Manual, ManualImageState, ManualItem, ManualStep } from "@/lib/workshop";
import MermaidBlock from "./MermaidBlock";
import QueueHint from "./QueueHint";
import { CheckIcon, WrenchIcon } from "@/components/icons";

type Payload = {
  id: number;
  kind: "build" | "repair";
  title: string;
  status: "generating" | "ready" | "error";
  error: string;
  request: { description: string; item: string; location: string; experience: string };
  content: Manual | null;
  flowchart: string;
  images: Record<string, ManualImageState>;
  progress: string[];
  canIllustrate: boolean;
};

const key = (pi: number, si: number) => `p${pi}s${si}`;
const DIFFICULTY_LABEL: Record<Manual["difficulty"], string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
  pro: "Pro-level",
};
/** Stop polling for pictures after this long, whatever state they claim to be in. */
const MAX_POLL_MS = 20 * 60 * 1000;

export default function ManualViewer({ id }: { id: number }) {
  const router = useRouter();
  const [m, setM] = useState<Payload | null>(null);
  const [missing, setMissing] = useState(false);
  const [redraws, setRedraws] = useState<Record<string, number>>({});
  const startedAt = useRef(Date.now());

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ manual: Payload }>(`/api/workshop/${id}`);
      setM(d.manual);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // poll while the text is being written, or while illustrations are still arriving
  const waiting = useMemo(() => {
    if (!m) return false;
    if (m.status === "generating") return true;
    if (m.status !== "ready" || !m.canIllustrate || !m.content) return false;
    return m.content.procedures.some((p, pi) =>
      p.steps.some((s, si) => s.figure && m.images[key(pi, si)] !== "ready" && m.images[key(pi, si)] !== "error"),
    );
  }, [m]);
  useEffect(() => {
    if (!waiting || Date.now() - startedAt.current > MAX_POLL_MS) return;
    const t = setInterval(refresh, 3500);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  const saveProgress = (next: string[]) => {
    setM((cur) => (cur ? { ...cur, progress: next } : cur));
    api(`/api/workshop/${id}`, { method: "PATCH", body: JSON.stringify({ progress: next }) }).catch(() => {});
  };
  const toggle = (k: string) => {
    if (!m) return;
    saveProgress(m.progress.includes(k) ? m.progress.filter((x) => x !== k) : [...m.progress, k]);
  };
  const redraw = async (k: string) => {
    setRedraws((r) => ({ ...r, [k]: (r[k] ?? 0) + 1 }));
    setM((cur) => (cur ? { ...cur, images: { ...cur.images, [k]: "pending" } } : cur));
    startedAt.current = Date.now();
    await api(`/api/workshop/${id}/image/${k}`, { method: "POST" }).catch(() => {});
  };
  const regenerate = async () => {
    if (m?.status === "ready" && !window.confirm("Rewrite this manual from scratch? Your ticked steps will be kept by position.")) return;
    await api(`/api/workshop/${id}`, { method: "PATCH", body: JSON.stringify({ regenerate: true }) }).catch(() => {});
    startedAt.current = Date.now();
    refresh();
  };
  const remove = async () => {
    if (!window.confirm("Delete this manual?")) return;
    await api(`/api/workshop/${id}`, { method: "DELETE" }).catch(() => {});
    router.push("/app/workshop");
  };

  if (missing) return <p className="text-[14px] text-muted">This manual couldn&apos;t be loaded.</p>;
  if (!m) return <p className="text-[13px] text-muted">Loading…</p>;

  const back = (
    <Link href="/app/workshop" className="self-start text-[13px] font-medium text-muted hover:text-ink print:hidden">
      ← Workshop
    </Link>
  );

  if (m.status !== "ready" || !m.content) {
    return (
      <>
        {back}
        <section className="glass flex flex-col items-center gap-4 rounded-[var(--radius-card-lg)] px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent/12 text-accent">
            <WrenchIcon className={`size-7 ${m.status === "generating" ? "animate-pulse" : ""}`} />
          </span>
          <h1 className="font-display text-[22px] font-extrabold uppercase text-ink">{m.title}</h1>
          <p className="max-w-[520px] text-[13.5px] text-muted">{m.request.description}</p>
          {m.status === "generating" ? (
            <>
              <p className="text-[13px] font-semibold text-ink">
                Writing your {m.kind === "repair" ? "troubleshooting & repair" : "build"} manual… this takes a minute or two.
              </p>
              <div className="max-w-[420px]">
                <QueueHint background />
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] text-accent">Couldn&apos;t write this one: {m.error || "unknown error"}</p>
              <button onClick={regenerate} className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white">
                Try again
              </button>
            </>
          )}
        </section>
      </>
    );
  }

  const c = m.content;
  const totalSteps = c.procedures.reduce((n, p) => n + p.steps.length, 0);
  const done = m.progress.length;
  const pct = totalSteps ? Math.round((done / totalSteps) * 100) : 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={() => window.print()} className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink">
            Print / PDF
          </button>
          <button onClick={regenerate} className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink">
            Rewrite
          </button>
          <button onClick={remove} className="rounded-full px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-accent">
            Delete
          </button>
        </div>
      </div>

      {/* ── cover ── */}
      <header className="glass relative overflow-hidden rounded-[var(--radius-card-lg)] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white">
            {c.kind === "repair" ? "Repair manual" : "Build manual"}
          </span>
          <span className="rounded-full bg-ink/8 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">Beta</span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(26px,4.4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">{c.title}</h1>
        {c.summary && <p className="mt-3 max-w-[720px] text-[14.5px] leading-relaxed text-ink/80">{c.summary}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Stat label="Difficulty" value={DIFFICULTY_LABEL[c.difficulty]} />
          {c.time && <Stat label="Time" value={c.time} />}
          {c.cost && <Stat label="Cost" value={c.cost} />}
          <Stat label="Steps" value={String(totalSteps)} />
        </div>
        <div className="mt-5 print:hidden">
          <div className="flex justify-between text-[11.5px] font-semibold text-muted">
            <span>Your progress</span>
            <span>
              {done} / {totalSteps} steps
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/8">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      {/* ── safety ── */}
      {(c.safety.length > 0 || c.stopIf.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          {c.safety.length > 0 && (
            <div className="rounded-[var(--radius-card-lg)] border-2 border-[#f5b400] bg-[#fff8e1] p-5">
              <h2 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wider text-[#7a5600]">
                <Hazard /> Before you start
              </h2>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-[#4a3708]">
                {c.safety.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {c.stopIf.length > 0 && (
            <div className="rounded-[var(--radius-card-lg)] border-2 border-accent/60 bg-[#fff0ec] p-5">
              <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-accent">Stop and call a pro if…</h2>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-[#5a2414]">
                {c.stopIf.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── inventory ── */}
      {(c.tools.length > 0 || c.parts.length > 0) && (
        <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
          <h2 className="font-display text-[19px] font-extrabold uppercase text-ink">What you need</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {c.tools.length > 0 && <Inventory title="Tools" items={c.tools} />}
            {c.parts.length > 0 && <Inventory title={c.kind === "build" ? "Materials" : "Parts"} items={c.parts} />}
          </div>
        </section>
      )}

      {/* ── troubleshooting ── */}
      {c.troubleshoot && <Troubleshooter manual={c} flowchart={m.flowchart} />}

      {/* ── procedures ── */}
      {c.procedures.map((p, pi) => {
        const doneHere = p.steps.filter((_, si) => m.progress.includes(key(pi, si))).length;
        return (
          <section key={p.id} id={`proc-${p.id}`} className="flex scroll-mt-6 flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-ink pb-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[1.6px] text-accent">
                  {c.kind === "repair" ? `Fix ${String.fromCharCode(65 + pi)}` : `Phase ${pi + 1}`}
                </p>
                <h2 className="font-display text-[clamp(20px,3vw,26px)] font-extrabold uppercase leading-tight text-ink">{p.title}</h2>
                {p.when && <p className="mt-1 max-w-[720px] text-[13px] text-muted">{p.when}</p>}
              </div>
              <span className="text-[12px] font-semibold text-muted print:hidden">
                {doneHere}/{p.steps.length} done
              </span>
            </div>
            <ol className="grid gap-4 lg:grid-cols-2">
              {p.steps.map((s, si) => {
                const k = key(pi, si);
                return (
                  <StepCard
                    key={k}
                    n={si + 1}
                    step={s}
                    done={m.progress.includes(k)}
                    onToggle={() => toggle(k)}
                    image={s.figure && m.canIllustrate ? (m.images[k] ?? "queued") : null}
                    src={`/api/workshop/${id}/image/${k}?v=${redraws[k] ?? 0}`}
                    onRedraw={() => redraw(k)}
                  />
                );
              })}
            </ol>
          </section>
        );
      })}

      {/* ── aftercare ── */}
      {(c.aftercare.test.length > 0 || c.aftercare.maintenance.length > 0) && (
        <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
          <h2 className="font-display text-[19px] font-extrabold uppercase text-ink">Finish &amp; keep it running</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {c.aftercare.test.length > 0 && (
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted">Test it</h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {c.aftercare.test.map((t, i) => (
                    <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-[#2f8a51]" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.aftercare.maintenance.length > 0 && (
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted">Maintenance schedule</h3>
                <table className="mt-2 w-full border-collapse text-[13px]">
                  <tbody>
                    {c.aftercare.maintenance.map((x, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap py-2 pr-3 align-top font-semibold text-ink">{x.every || "—"}</td>
                        <td className="py-2 text-ink/80">{x.task}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <p className="pb-4 text-center text-[11.5px] text-muted">
        AI-written beta manual. Verify specs against the manufacturer&apos;s documentation and local code. Isolate power and prove it dead before touching any wiring.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-[12px] border border-line bg-white/60 px-3 py-1.5">
      <span className="block text-[9.5px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </span>
  );
}

function Hazard() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path d="M12 3 2 20h20L12 3Z" fill="#f5b400" stroke="#1b2436" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10v4.5M12 17v.5" stroke="#1b2436" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** LEGO-style inventory: big quantity, the part, its spec. */
function Inventory({ title, items }: { title: string; items: ManualItem[] }) {
  return (
    <div>
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted">{title}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 rounded-[12px] border border-[#b9d3ee] bg-[#eef5fc] px-3 py-2">
            <span className="min-w-[30px] font-display text-[15px] font-extrabold text-[#1d4f86]">{it.qty ? `${it.qty.replace(/^x/i, "")}${/^\d+$/.test(it.qty) ? "×" : ""}` : "1×"}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-snug text-ink">{it.name}</span>
              {it.note && <span className="block text-[11.5px] leading-snug text-muted">{it.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCard({
  n,
  step,
  done,
  onToggle,
  image,
  src,
  onRedraw,
}: {
  n: number;
  step: ManualStep;
  done: boolean;
  onToggle: () => void;
  image: ManualImageState | "queued" | null;
  src: string;
  onRedraw: () => void;
}) {
  return (
    <li
      className={`glass flex break-inside-avoid flex-col gap-3 rounded-[var(--radius-card-lg)] p-4 sm:p-5 transition-opacity ${done ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="font-display text-[44px] font-extrabold leading-[0.85] text-ink">{n}</span>
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="text-[15.5px] font-bold leading-snug text-ink">{step.title}</h3>
          {step.tools.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {step.tools.map((t, i) => (
                <span key={i} className="rounded-full bg-ink/8 px-2 py-0.5 text-[10.5px] font-semibold text-ink/70">
                  🔧 {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          aria-pressed={done}
          title={done ? "Mark not done" : "Mark done"}
          className={`grid size-8 shrink-0 place-items-center rounded-full border-2 print:hidden ${
            done ? "border-[#2f8a51] bg-[#2f8a51] text-white" : "border-line bg-white/70 text-transparent hover:text-muted"
          }`}
        >
          <CheckIcon className="size-4" />
        </button>
      </div>

      {step.parts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 self-start rounded-[12px] border border-[#b9d3ee] bg-[#eef5fc] p-2">
          {step.parts.map((p, i) => (
            <span key={i} className="rounded-[8px] bg-white px-2 py-1 text-[12px] text-ink">
              <b className="text-[#1d4f86]">{p.qty ? (/^\d+$/.test(p.qty) ? `${p.qty}×` : p.qty) : "1×"}</b> {p.name}
            </span>
          ))}
        </div>
      )}

      {image && (
        <figure className="relative overflow-hidden rounded-[14px] border border-line bg-white">
          {image === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={step.figure} className="aspect-[4/3] w-full object-contain" loading="lazy" />
          ) : image === "error" ? (
            <div className="grid aspect-[4/3] place-items-center p-4 text-center">
              <div>
                <p className="text-[12.5px] text-muted">Couldn&apos;t draw this one.</p>
                <button onClick={onRedraw} className="mt-2 text-[12px] font-semibold text-accent print:hidden">
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <div className="grid aspect-[4/3] animate-pulse place-items-center bg-ink/[0.03] p-6 text-center">
              <p className="max-w-[300px] text-[12px] italic text-muted">
                {image === "pending" ? "Drawing…" : "Queued for drawing…"} {step.figure}
              </p>
            </div>
          )}
          {image === "ready" && (
            <button
              onClick={onRedraw}
              className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold text-muted shadow-sm hover:text-ink print:hidden"
            >
              Redraw
            </button>
          )}
        </figure>
      )}

      {step.actions.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {step.actions.map((a, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink">
              <span className="mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
                {String.fromCharCode(97 + i)}
              </span>
              <span>{a}</span>
            </li>
          ))}
        </ol>
      )}

      {step.check && (
        <p className="flex gap-2 rounded-[10px] bg-[#e9f4ec] px-3 py-2 text-[12.5px] leading-relaxed text-[#14351f]">
          <CheckIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Check:</b> {step.check}
          </span>
        </p>
      )}
      {step.caution && (
        <p className="flex gap-2 rounded-[10px] bg-[#fff8e1] px-3 py-2 text-[12.5px] leading-relaxed text-[#4a3708]">
          <Hazard />
          <span>
            <b>Caution:</b> {step.caution}
          </span>
        </p>
      )}
    </li>
  );
}

/** A yes/no walk through the diagnostic tree that ends at a fix, a pro, or done. */
function Troubleshooter({ manual, flowchart }: { manual: Manual; flowchart: string }) {
  const tree = manual.troubleshoot!;
  const byId = useMemo(() => new Map(tree.checks.map((c) => [c.id, c])), [tree]);
  const [path, setPath] = useState<{ id: string; answer: "yes" | "no" }[]>([]);
  const [showChart, setShowChart] = useState(false);

  // where the answers so far have led
  let at: CheckTarget = { kind: "check", id: tree.start };
  for (const step of path) {
    const c = byId.get(step.id);
    if (!c) break;
    at = step.answer === "yes" ? c.yes : c.no;
  }
  const current = at.kind === "check" ? byId.get(at.id) : undefined;
  const fixIndex = at.kind === "fix" ? manual.procedures.findIndex((p) => p.id === (at as { id: string }).id) : -1;
  const fix = fixIndex >= 0 ? manual.procedures[fixIndex] : undefined;

  const answer = (a: "yes" | "no") => current && setPath((p) => [...p, { id: current.id, answer: a }]);

  return (
    <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[19px] font-extrabold uppercase text-ink">Find the fault</h2>
        <div className="flex gap-3 print:hidden">
          {path.length > 0 && (
            <>
              <button onClick={() => setPath((p) => p.slice(0, -1))} className="text-[12px] font-semibold text-muted hover:text-ink">
                ← Back
              </button>
              <button onClick={() => setPath([])} className="text-[12px] font-semibold text-muted hover:text-ink">
                Start over
              </button>
            </>
          )}
        </div>
      </div>

      {path.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1 print:hidden">
          {path.map((p, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-muted">
              <span className={`shrink-0 rounded-full px-1.5 font-bold ${p.answer === "yes" ? "bg-[#e9f4ec] text-[#2f8a51]" : "bg-[#fff0ec] text-accent"}`}>
                {p.answer === "yes" ? "Yes" : "No"}
              </span>
              <span className="truncate">{byId.get(p.id)?.question}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 rounded-[16px] border-2 border-ink bg-white/80 p-5 print:hidden">
        {current ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Check {path.length + 1}</p>
            <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{current.question}</p>
            {current.how && <p className="mt-2 text-[13.5px] leading-relaxed text-ink/80">{current.how}</p>}
            {current.tool && current.tool.toLowerCase() !== "none" && (
              <p className="mt-2 text-[12px] font-semibold text-muted">🔧 {current.tool}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => answer("yes")} className="rounded-full bg-[#2f8a51] px-6 py-2.5 text-[13.5px] font-bold text-white">
                Yes
              </button>
              <button onClick={() => answer("no")} className="rounded-full bg-accent px-6 py-2.5 text-[13.5px] font-bold text-white">
                No
              </button>
            </div>
          </>
        ) : fix ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2f8a51]">Most likely fix</p>
            <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{fix.title}</p>
            {fix.when && <p className="mt-2 text-[13.5px] text-ink/80">{fix.when}</p>}
            <button
              onClick={() => document.getElementById(`proc-${fix.id}`)?.scrollIntoView({ behavior: "smooth" })}
              className="glassx-dark mt-4 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              Go to Fix {String.fromCharCode(65 + fixIndex)} ↓
            </button>
          </>
        ) : at.kind === "done" ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2f8a51]">Sorted</p>
            <p className="mt-1 text-[17px] font-bold text-ink">That should be it — run the tests at the bottom to confirm.</p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Time for a professional</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
              This points past what&apos;s safe or sensible to DIY. Tell the technician what you checked above — it will save them time and you money.
            </p>
          </>
        )}
      </div>

      {flowchart && (
        <div className="mt-4">
          <button onClick={() => setShowChart((s) => !s)} className="text-[12.5px] font-semibold text-accent print:hidden">
            {showChart ? "Hide" : "Show"} the whole troubleshooting flowchart
          </button>
          <div className={showChart ? "mt-3" : "hidden print:mt-3 print:block"}>
            <MermaidBlock code={flowchart} />
          </div>
        </div>
      )}
    </section>
  );
}
