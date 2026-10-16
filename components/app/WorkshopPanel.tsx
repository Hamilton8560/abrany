"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmtWhen } from "@/lib/client";
import { WrenchIcon } from "@/components/icons";

type Row = {
  id: number;
  kind: "build" | "repair";
  title: string;
  status: "generating" | "ready" | "error";
  error: string;
  created_at: string;
};

const EXAMPLES: Record<Row["kind"], string[]> = {
  repair: [
    "My Chinese folding treadmill shows E1 and the belt won't move, but the display lights up",
    "Bathroom GFCI outlet keeps tripping when it rains",
    "Car makes a grinding noise from the front left when braking",
    "Washing machine fills but won't spin",
  ],
  build: [
    "Build a 2-bedroom concrete block house (sistema mixto) on a sloped lot",
    "Wire a 12V solar setup with 2 panels and a battery for a cabin",
    "Build a covered wooden deck 4m × 3m attached to the house",
    "Pour a reinforced concrete slab for a garage",
  ],
};

export default function WorkshopPanel() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kind, setKind] = useState<Row["kind"]>("repair");
  const [description, setDescription] = useState("");
  const [item, setItem] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState<"beginner" | "handy" | "pro">("handy");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await api<{ manuals: Row[] }>("/api/workshop").catch(() => null);
    if (d) setRows(d.manuals);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // poll while anything is still being written
  useEffect(() => {
    if (!rows?.some((r) => r.status === "generating")) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [rows, refresh]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await api<{ manual: { id: number } }>("/api/workshop", {
        method: "POST",
        body: JSON.stringify({ kind, description, item, location, experience }),
      });
      router.push(`/app/workshop/${d.manual.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the manual");
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? rs);
    await api(`/api/workshop/${r.id}`, { method: "DELETE" }).catch(() => {});
  };

  const field =
    "w-full rounded-[14px] border border-line bg-white/70 px-4 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-6">
      <section className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-5 sm:p-6">
        <div className="flex gap-1.5">
          {(["repair", "build"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold ${kind === k ? "glassx-dark text-white" : "glassx text-ink"}`}
            >
              {k === "repair" ? "Troubleshoot & repair" : "Build something"}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink">
            {kind === "repair" ? "What's wrong? Symptoms, sounds, error codes, what you've tried" : "What are you building?"}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={EXAMPLES[kind][0]}
            className={`${field} resize-y`}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES[kind].map((ex) => (
            <button
              key={ex}
              onClick={() => setDescription(ex)}
              className="rounded-full bg-ink/6 px-3 py-1 text-left text-[11.5px] text-muted hover:bg-ink/10 hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink">{kind === "repair" ? "Make / model" : "Size / spec"} <span className="font-normal text-muted">(optional)</span></span>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={kind === "repair" ? "e.g. Merax JK1603E" : "e.g. 8m × 6m, one storey"} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink">Where <span className="font-normal text-muted">(optional)</span></span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. San Miguel, El Salvador" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink">Your experience</span>
            <select value={experience} onChange={(e) => setExperience(e.target.value as typeof experience)} className={field}>
              <option value="beginner">Beginner — explain everything</option>
              <option value="handy">Handy — I own tools</option>
              <option value="pro">Pro — just the specs</option>
            </select>
          </label>
        </div>

        {err && <p className="text-[12.5px] text-accent">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted">
            Beta: AI manuals can be wrong. Check specs against the maker&apos;s manual and local code, and
            never work on live power.
          </p>
          <button
            onClick={create}
            disabled={busy || description.trim().length < 8}
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Starting…" : "Write my manual"}
          </button>
        </div>
      </section>

      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="glass flex items-center gap-3 rounded-[16px] px-4 py-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent/12 text-accent">
                <WrenchIcon className="size-5" />
              </span>
              <Link href={`/app/workshop/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{r.title}</p>
                <p className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full bg-ink/8 px-2 py-0.5 font-medium">{r.kind === "repair" ? "Repair" : "Build"}</span>
                  {r.status === "generating" ? (
                    <span className="flex items-center gap-1 text-accent">
                      <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Writing…
                    </span>
                  ) : r.status === "error" ? (
                    <span className="text-accent">Failed</span>
                  ) : (
                    <span>{fmtWhen(r.created_at)}</span>
                  )}
                </p>
              </Link>
              <button onClick={() => remove(r)} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-accent">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
