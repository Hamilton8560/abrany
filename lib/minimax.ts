import Anthropic from "@anthropic-ai/sdk";
import { acquireSlot, withQueue } from "./queue";

/**
 * LLM layer. Both MiniMax and Kimi Code expose Anthropic-compatible endpoints,
 * so one Anthropic SDK client drives either. `LLM_PROVIDER` selects:
 *   - "minimax" (default) — MiniMax M3
 *   - "kimi"              — Kimi Code (K2.7 Code)
 *   - "balanced"          — round-robin per call, to spread load across BOTH
 *     coding-plan subscriptions and ease each one's shared concurrency limit.
 * Every call still routes through the shared concurrency queue (see ./queue).
 * (File name kept as minimax.ts to avoid churn; it's the general LLM layer.)
 */

type ProviderName = "minimax" | "kimi";

type Provider = { name: ProviderName; client: Anthropic; model: string };

type Global = typeof globalThis & {
  __llmClients?: Partial<Record<ProviderName, Provider>>;
  __llmRR?: number;
};
const g = globalThis as Global;

function build(name: ProviderName): Provider {
  if (!g.__llmClients) g.__llmClients = {};
  const cached = g.__llmClients[name];
  if (cached) return cached;

  let client: Anthropic;
  let model: string;
  if (name === "kimi") {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) throw new Error("KIMI_API_KEY is not set");
    client = new Anthropic({ apiKey, baseURL: process.env.KIMI_BASE_URL ?? "https://api.kimi.com/coding" });
    model = process.env.KIMI_MODEL ?? "k2.7-code";
  } else {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) throw new Error("MINIMAX_API_KEY is not set");
    // NB: the Anthropic SDK appends `/v1/messages`, so the base must NOT include `/v1`.
    client = new Anthropic({ apiKey, baseURL: process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/anthropic" });
    model = process.env.MINIMAX_MODEL ?? "MiniMax-M3";
  }
  const provider: Provider = { name, client, model };
  g.__llmClients[name] = provider;
  return provider;
}

/** Pick the provider for this call, honoring LLM_PROVIDER (incl. round-robin balancing). */
function pick(): Provider {
  const mode = (process.env.LLM_PROVIDER ?? "minimax").toLowerCase();
  if (mode === "kimi") return build("kimi");
  if (mode === "balanced") {
    g.__llmRR = (g.__llmRR ?? 0) + 1;
    return build(g.__llmRR % 2 === 0 ? "minimax" : "kimi");
  }
  return build("minimax");
}

export function activeProviderInfo(): { mode: string; providers: string[] } {
  const mode = (process.env.LLM_PROVIDER ?? "minimax").toLowerCase();
  const providers = mode === "balanced" ? ["minimax", "kimi"] : [mode === "kimi" ? "kimi" : "minimax"];
  return { mode, providers };
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Non-streaming completion (used for structured generation). Queued + retried. */
export async function complete(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  return withQueue(async () => {
    const { client, model } = pick();
    const res = await client.messages.create({
      model,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.7,
      system: params.system,
      messages: params.messages,
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  });
}

/**
 * Streaming completion. Holds a concurrency slot for the whole stream and
 * yields text deltas (thinking deltas are ignored). Slot released on finish/abort.
 */
export async function* streamText(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string, void, unknown> {
  const release = await acquireSlot();
  try {
    const { client, model } = pick();
    const stream = await client.messages.create(
      {
        model,
        max_tokens: params.maxTokens ?? 2048,
        temperature: params.temperature ?? 0.7,
        system: params.system,
        messages: params.messages,
        stream: true,
      },
      { signal: params.signal },
    );
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta" &&
        event.delta.text
      ) {
        yield event.delta.text;
      }
    }
  } finally {
    release();
  }
}
