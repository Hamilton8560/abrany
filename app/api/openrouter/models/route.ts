import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy + normalize OpenRouter's public model catalog so the Settings model
 * picker can offer a searchable list with per-model pricing. Cached in-process
 * for an hour (the list rarely changes and it's ~300 entries).
 */
type OrModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
};
type PickerModel = {
  id: string;
  name: string;
  context: number;
  promptPerM: number; // USD per 1M input tokens
  completionPerM: number; // USD per 1M output tokens
};

type Cache = { at: number; models: PickerModel[] };
const g = globalThis as typeof globalThis & { __orModels?: Cache };
const TTL = 60 * 60 * 1000;

async function fetchModels(): Promise<PickerModel[]> {
  if (g.__orModels && Date.now() - g.__orModels.at < TTL) return g.__orModels.models;
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const json = (await res.json()) as { data?: OrModel[] };
  const models: PickerModel[] = (json.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context: m.context_length ?? 0,
      promptPerM: Number(m.pricing?.prompt ?? 0) * 1_000_000,
      completionPerM: Number(m.pricing?.completion ?? 0) * 1_000_000,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  g.__orModels = { at: Date.now(), models };
  return models;
}

export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  try {
    return NextResponse.json({ models: await fetchModels() });
  } catch {
    return NextResponse.json({ models: [], error: "Could not load OpenRouter models" }, { status: 502 });
  }
}
