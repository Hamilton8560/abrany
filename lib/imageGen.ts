import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./db";
import { resolveUserLlm } from "./minimax";
import type { User } from "./repo";

/**
 * Step illustrations for workshop manuals, via MiniMax image-01 (~$0.0035 a
 * picture). Separate from the LLM queue on purpose: it's a different API with
 * its own limits, and the manual's text must never wait behind pictures.
 *
 * Who pays mirrors who pays for text: server-powered users (the owner, org
 * members whose company runs on the server, free-AI deployments) use the
 * server key; a user who brought their own MiniMax key uses theirs; anyone
 * else gets a manual without pictures rather than an error.
 */

/** The instruction-booklet look every figure is drawn in. Text is banned: image models garble it. */
const STYLE =
  "Instruction manual illustration in the style of a LEGO or IKEA assembly booklet. Clean isometric technical line art, flat muted colors, thick clean black outlines, bold motion arrows where something moves, pure white background, one clear action, no clutter. Absolutely no text, no words, no letters, no numbers, no labels, no logos.";

export function imageKeyFor(user: Pick<User, "id" | "is_owner" | "ai_provider" | "ai_key" | "ai_model">): string | null {
  const r = resolveUserLlm(user);
  if (r.mode === "server") return process.env.MINIMAX_IMAGE_API_KEY || process.env.MINIMAX_API_KEY || null;
  if (r.mode === "byo" && r.creds.provider === "minimax") return r.creds.key;
  return null;
}

/** Generate one illustration and return the JPEG bytes. Throws on any API failure. */
export async function generateIllustration(figure: string, key: string): Promise<Buffer> {
  const res = await fetch("https://api.minimax.io/v1/image_generation", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.MINIMAX_IMAGE_MODEL || "image-01",
      prompt: `${STYLE}\n\nShow: ${figure}`.slice(0, 1500),
      aspect_ratio: "4:3",
      n: 1,
      response_format: "base64",
      prompt_optimizer: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { image_base64?: string[] };
    base_resp?: { status_code?: number; status_msg?: string };
  };
  const b64 = data.data?.image_base64?.[0];
  if (!res.ok || !b64 || (data.base_resp?.status_code ?? 0) !== 0)
    throw new Error(`Image generation failed: ${data.base_resp?.status_msg || res.status}`);
  return Buffer.from(b64, "base64");
}

const dirFor = (manualId: number) => join(dataDir(), "manual-images", String(manualId));
const safeKey = (key: string) => (/^p\d+s\d+$/.test(key) ? key : null);

export function saveManualImage(manualId: number, key: string, jpeg: Buffer): void {
  const k = safeKey(key);
  if (!k) throw new Error("Bad image key");
  mkdirSync(dirFor(manualId), { recursive: true });
  writeFileSync(join(dirFor(manualId), `${k}.jpg`), jpeg);
}

export function readManualImage(manualId: number, key: string): Buffer | null {
  const k = safeKey(key);
  if (!k) return null;
  const file = join(dirFor(manualId), `${k}.jpg`);
  return existsSync(file) ? readFileSync(file) : null;
}

export function deleteManualImages(manualId: number): void {
  rmSync(dirFor(manualId), { recursive: true, force: true });
}
