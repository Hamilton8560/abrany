import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AsyncLocalStorage } from "node:async_hooks";
import { acquireSlot, withQueue } from "./queue";
import { isFreeAiEnabled, type User } from "./repo";
import { languageDirective } from "./languages";

/**
 * LLM layer — multi-provider, per-user.
 *
 * The OWNER uses the server's built-in keys (env: LLM_PROVIDER minimax|kimi|
 * balanced). Every other user brings THEIR OWN key for one of:
 *   - minimax / kimi   → Anthropic-compatible endpoints (Anthropic SDK)
 *   - deepseek / openrouter → OpenAI-compatible endpoints (OpenAI SDK)
 *
 * The current user's creds ride an AsyncLocalStorage set at the request/job
 * boundary via withLlm(), so complete()/streamText() pick them up without every
 * coach function needing a creds argument. No creds in the store → server env.
 * All calls still pass through the shared concurrency queue.
 */

export type Provider =
  | "minimax"
  | "kimi"
  | "deepseek"
  | "openrouter"
  | "anthropic"
  | "openai"
  | "gemini";
export type LlmCreds = { provider: Provider; key: string; model: string };

type Style = "anthropic" | "openai";
type Resolved =
  | { style: "anthropic"; client: Anthropic; model: string }
  | { style: "openai"; client: OpenAI; model: string };

const DEFAULTS: Record<Provider, { style: Style; baseURL: string; model: string }> = {
  minimax: { style: "anthropic", baseURL: "https://api.minimax.io/anthropic", model: "MiniMax-M3" },
  kimi: { style: "anthropic", baseURL: "https://api.kimi.com/coding", model: "k3" },
  deepseek: { style: "openai", baseURL: "https://api.deepseek.com", model: "deepseek-chat" },
  openrouter: { style: "openai", baseURL: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat" },
  // top-tier "bring your own" providers
  anthropic: { style: "anthropic", baseURL: "https://api.anthropic.com", model: "claude-sonnet-5" },
  openai: { style: "openai", baseURL: "https://api.openai.com/v1", model: "gpt-4o" },
  gemini: { style: "openai", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
};

export const PROVIDERS = Object.keys(DEFAULTS) as Provider[];

/* ── per-request credential context ────────────────────────── */
type LlmCtx = { creds: LlmCreds | null; lang?: string };
type G = typeof globalThis & { __llmStore?: AsyncLocalStorage<LlmCtx | null>; __llmRR?: number; __llmClients?: Map<string, Resolved> };
const g = globalThis as G;
const store = (g.__llmStore ??= new AsyncLocalStorage<LlmCtx | null>());

/**
 * Run `fn` with the given AI credentials (null → server keys) and, optionally,
 * the language every generation inside should be written in. Both ride an
 * AsyncLocalStorage so complete()/streamText() pick them up without threading
 * args through each coach function.
 */
export function withLlm<T>(creds: LlmCreds | null, fn: () => Promise<T>, lang?: string): Promise<T> {
  return store.run({ creds, lang }, fn);
}

/** Prepend the active language directive to a system prompt, if a language is set. */
function withLanguage(system: string): string {
  const lang = store.getStore()?.lang;
  if (!lang) return system;
  return `${languageDirective(lang)}\n\n${system}`;
}

/** How a user's generation should be powered. */
export function resolveUserLlm(
  user: Pick<User, "is_owner" | "ai_provider" | "ai_key" | "ai_model">,
): { mode: "server" } | { mode: "byo"; creds: LlmCreds } | { mode: "nokey" } {
  if (user.is_owner) return { mode: "server" };
  if (user.ai_provider && user.ai_key && PROVIDERS.includes(user.ai_provider as Provider)) {
    return {
      mode: "byo",
      creds: { provider: user.ai_provider as Provider, key: user.ai_key, model: user.ai_model || "" },
    };
  }
  // Keyless user, but the owner opened up the built-in AI to everyone: run on the
  // server keys, which all funnel through the one shared concurrency queue.
  if (isFreeAiEnabled()) return { mode: "server" };
  return { mode: "nokey" };
}

function clientFor(creds: LlmCreds): Resolved {
  const cacheKey = `${creds.provider}:${creds.key}:${creds.model}`;
  const cache = (g.__llmClients ??= new Map());
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const d = DEFAULTS[creds.provider];
  const model = creds.model || d.model;
  const resolved: Resolved =
    d.style === "anthropic"
      ? { style: "anthropic", client: new Anthropic({ apiKey: creds.key, baseURL: d.baseURL }), model }
      : { style: "openai", client: new OpenAI({ apiKey: creds.key, baseURL: d.baseURL }), model };
  cache.set(cacheKey, resolved);
  return resolved;
}

/** Server (owner) provider from env — supports minimax | kimi | balanced. */
function serverResolved(): Resolved {
  const mode = (process.env.LLM_PROVIDER ?? "minimax").toLowerCase();
  let provider: Provider = "minimax";
  if (mode === "kimi") provider = "kimi";
  else if (mode === "balanced") {
    g.__llmRR = (g.__llmRR ?? 0) + 1;
    provider = g.__llmRR % 2 === 0 ? "minimax" : "kimi";
  }
  const key = provider === "kimi" ? process.env.KIMI_API_KEY : process.env.MINIMAX_API_KEY;
  if (!key) throw new Error(`Server ${provider} key is not set`);
  const baseURL =
    provider === "kimi"
      ? process.env.KIMI_BASE_URL ?? DEFAULTS.kimi.baseURL
      : process.env.MINIMAX_BASE_URL ?? DEFAULTS.minimax.baseURL;
  const model =
    provider === "kimi"
      ? process.env.KIMI_MODEL ?? DEFAULTS.kimi.model
      : process.env.MINIMAX_MODEL ?? DEFAULTS.minimax.model;
  return { style: "anthropic", client: new Anthropic({ apiKey: key, baseURL }), model };
}

function resolve(): Resolved {
  const creds = store.getStore()?.creds ?? null;
  return creds ? clientFor(creds) : serverResolved();
}

/** For routes: the creds to run generation as, or an error string if no key set. */
export function llmContext(
  user: Pick<User, "is_owner" | "ai_provider" | "ai_key" | "ai_model">,
): { creds: LlmCreds | null } | { error: string } {
  const r = resolveUserLlm(user);
  if (r.mode === "nokey") return { error: "Add your AI key in Settings to generate content." };
  return { creds: r.mode === "byo" ? r.creds : null };
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Non-streaming completion (structured generation). Queued + retried. */
export async function complete(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  return withQueue(async () => {
    const r = resolve();
    const system = withLanguage(params.system);
    if (r.style === "anthropic") {
      const res = await r.client.messages.create({
        model: r.model,
        max_tokens: params.maxTokens ?? 2048,
        temperature: params.temperature ?? 0.7,
        system,
        messages: params.messages,
      });
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
    const res = await r.client.chat.completions.create({
      model: r.model,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.7,
      messages: [{ role: "system", content: system }, ...params.messages],
    });
    return res.choices[0]?.message?.content ?? "";
  });
}

/** Streaming completion. Holds a slot for the whole stream; yields text deltas. */
export async function* streamText(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string, void, unknown> {
  const release = await acquireSlot();
  try {
    const r = resolve();
    const system = withLanguage(params.system);
    if (r.style === "anthropic") {
      const stream = await r.client.messages.create(
        {
          model: r.model,
          max_tokens: params.maxTokens ?? 2048,
          temperature: params.temperature ?? 0.7,
          system,
          messages: params.messages,
          stream: true,
        },
        { signal: params.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          yield event.delta.text;
        }
      }
    } else {
      const stream = await r.client.chat.completions.create(
        {
          model: r.model,
          max_tokens: params.maxTokens ?? 2048,
          temperature: params.temperature ?? 0.7,
          messages: [{ role: "system", content: system }, ...params.messages],
          stream: true,
        },
        { signal: params.signal },
      );
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    }
  } finally {
    release();
  }
}
