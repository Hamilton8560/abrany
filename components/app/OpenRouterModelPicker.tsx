"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";

type Model = { id: string; name: string; context: number; promptPerM: number; completionPerM: number };

const price = (n: number) => (n === 0 ? "free" : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const priceLabel = (m: Model) =>
  m.promptPerM === 0 && m.completionPerM === 0
    ? "Free"
    : `${price(m.promptPerM)}/M in · ${price(m.completionPerM)}/M out`;

/** Searchable OpenRouter model dropdown with live per-model pricing. */
export default function OpenRouterModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [models, setModels] = useState<Model[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ models: Model[] }>("/api/openrouter/models")
      .then((d) => setModels(d.models))
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = useMemo(() => models?.find((m) => m.id === value) ?? null, [models, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = models ?? [];
    if (!q) return list.slice(0, 60);
    return list.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 60);
  }, [models, query]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[14px] border border-line bg-white/70 px-4 py-3 text-left text-[14px] text-ink outline-none focus:border-accent/50"
      >
        <span className="min-w-0 truncate">
          {selected ? selected.name : value || "Search models…"}
        </span>
        <span className="shrink-0 text-[11px] font-medium text-muted">
          {selected ? priceLabel(selected) : models === null ? "loading…" : ""}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-[14px] border border-line bg-white/95 shadow-xl backdrop-blur-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 300+ models…"
            className="w-full border-b border-line bg-transparent px-4 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-muted/60"
          />
          <ul className="max-h-[300px] overflow-y-auto">
            {models === null && <li className="px-4 py-3 text-[13px] text-muted">Loading models…</li>}
            {models !== null && filtered.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-muted">No models match “{query}”.</li>
            )}
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/8 ${
                    m.id === value ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{m.name}</span>
                    <span className="block truncate text-[11px] text-muted">{m.id}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] font-medium text-muted">
                    {priceLabel(m)}
                    {m.context ? <span className="block text-[10px] opacity-70">{Math.round(m.context / 1000)}k ctx</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
