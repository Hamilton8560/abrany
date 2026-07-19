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

/** Anthropic client for a specific server provider, from env. */
function serverClient(provider: "minimax" | "kimi"): Resolved {
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

/**
 * Ordered server providers to try. LLM_PROVIDER picks the primary, but the OTHER
 * provider is always appended as a fallback (when its key exists) — so if Kimi/K3
 * errors or returns nothing, generation automatically fails over to MiniMax (and
 * vice-versa) instead of surfacing an error to the user.
 */
function serverChain(prefer?: "minimax" | "kimi"): Resolved[] {
  const mode = (process.env.LLM_PROVIDER ?? "minimax").toLowerCase();
  const have = (p: "minimax" | "kimi") => (p === "kimi" ? !!process.env.KIMI_API_KEY : !!process.env.MINIMAX_API_KEY);
  let order: ("minimax" | "kimi")[];
  if (mode === "kimi") order = ["kimi", "minimax"];
  else if (mode === "balanced") {
    g.__llmRR = (g.__llmRR ?? 0) + 1;
    order = g.__llmRR % 2 === 0 ? ["minimax", "kimi"] : ["kimi", "minimax"];
  } else order = ["minimax", "kimi"];
  // A caller can pin the primary (e.g. translation prefers the fast non-reasoning
  // model over K3), while keeping the other as fallback.
  if (prefer) order = [prefer, ...order.filter((p) => p !== prefer)];
  const chain = order.filter(have).map(serverClient);
  if (!chain.length) throw new Error("No server AI key is configured");
  return chain;
}

/** Providers to attempt in order: BYO users get their one; server gets a fallback chain. */
function attemptChain(prefer?: "minimax" | "kimi"): Resolved[] {
  const creds = store.getStore()?.creds ?? null;
  return creds ? [clientFor(creds)] : serverChain(prefer);
}

/**
 * One provider attempt for a "give me the whole answer" call. We STREAM and
 * accumulate rather than doing a blocking create() for two reasons:
 *   1. The Anthropic SDK refuses a non-streaming request whose max_tokens is
 *      large enough that it *could* run past 10 minutes — so a generous cap is
 *      only reachable via streaming.
 *   2. A generous cap (see MAX_OUTPUT_TOKENS in coach) means reasoning models
 *      like Kimi/k3, whose thinking tokens count against max_tokens, no longer
 *      get their visible answer truncated mid-sentence.
 * The stop reason is checked so a length-truncated response is treated as a
 * failure (throw → provider failover / job retry) instead of being saved as if
 * it were complete.
 */
async function runComplete(
  r: Resolved,
  system: string,
  params: { messages: ChatMessage[]; maxTokens?: number; temperature?: number },
): Promise<string> {
  const max_tokens = params.maxTokens ?? 2048;
  const temperature = params.temperature ?? 0.7;
  let text = "";

  if (r.style === "anthropic") {
    let stopReason: string | null = null;
    const stream = await r.client.messages.create({
      model: r.model,
      max_tokens,
      temperature,
      system,
      messages: params.messages,
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
      } else if (event.type === "message_delta" && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason;
      }
    }
    if (stopReason === "max_tokens") throw new Error(`${r.model} response hit the token limit (truncated)`);
    return text;
  }

  let finishReason: string | null = null;
  const stream = await r.client.chat.completions.create({
    model: r.model,
    max_tokens,
    temperature,
    messages: [{ role: "system", content: system }, ...params.messages],
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) text += delta;
    if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
  }
  if (finishReason === "length") throw new Error(`${r.model} response hit the token limit (truncated)`);
  return text;
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

/**
 * Non-streaming completion (structured generation). Each provider attempt is
 * queued + retried on 429/5xx; if a provider errors OR returns an empty response,
 * we fail over to the next provider in the chain before giving up.
 */
export async function complete(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Pin the primary server provider for this call (fallback still applies). */
  prefer?: "minimax" | "kimi";
}): Promise<string> {
  const chain = attemptChain(params.prefer);
  const system = withLanguage(params.system);
  let lastErr: unknown = null;
  for (let i = 0; i < chain.length; i++) {
    try {
      const text = await withQueue(() => runComplete(chain[i], system, params));
      if (text && text.trim()) return text;
      lastErr = new Error(`Empty response from ${chain[i].model}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI generation failed");
}

/** A streamed chunk: the model's private reasoning, or the visible answer. */
export type StreamChunk = { kind: "thinking" | "text"; text: string };

/**
 * Streaming completion. Yields BOTH the model's reasoning (kind:"thinking") and
 * its answer (kind:"text") as they arrive — reasoning models like Kimi/k3 emit
 * thinking within ~1ms but their answer only after many seconds, so surfacing the
 * thinking is what keeps the tutor from looking frozen. Holds one slot for the
 * whole stream; fails over to the next provider only if a stream can't be opened.
 */
export async function* streamText(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk, void, unknown> {
  const chain = attemptChain();
  const system = withLanguage(params.system);
  const release = await acquireSlot();
  try {
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i];
      const last = i === chain.length - 1;
      let yielded = false;
      try {
        if (r.style === "anthropic") {
          const stream = await r.client.messages.create(
            { model: r.model, max_tokens: params.maxTokens ?? 2048, temperature: params.temperature ?? 0.7, system, messages: params.messages, stream: true },
            { signal: params.signal },
          );
          for await (const event of stream) {
            if (event.type !== "content_block_delta") continue;
            const d = event.delta as { type: string; text?: string; thinking?: string };
            if (d.type === "thinking_delta" && d.thinking) {
              yielded = true;
              yield { kind: "thinking", text: d.thinking };
            } else if (d.type === "text_delta" && d.text) {
              yielded = true;
              yield { kind: "text", text: d.text };
            }
          }
        } else {
          const stream = await r.client.chat.completions.create(
            { model: r.model, max_tokens: params.maxTokens ?? 2048, temperature: params.temperature ?? 0.7, messages: [{ role: "system", content: system }, ...params.messages], stream: true },
            { signal: params.signal },
          );
          for await (const chunk of stream) {
            // OpenAI-compatible reasoning models expose thinking as reasoning / reasoning_content
            const delta = chunk.choices[0]?.delta as { content?: string; reasoning?: string; reasoning_content?: string } | undefined;
            const reasoning = delta?.reasoning ?? delta?.reasoning_content;
            if (reasoning) {
              yielded = true;
              yield { kind: "thinking", text: reasoning };
            }
            if (delta?.content) {
              yielded = true;
              yield { kind: "text", text: delta.content };
            }
          }
        }
        return;
      } catch (err) {
        // fall back to the next provider only if we haven't emitted anything yet
        if (last || yielded) throw err;
      }
    }
  } finally {
    release();
  }
}
