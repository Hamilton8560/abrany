import Anthropic from "@anthropic-ai/sdk";
import { acquireSlot, withQueue } from "./queue";

/**
 * MiniMax exposes an Anthropic-compatible endpoint, so we drive it with the
 * official Anthropic SDK pointed at MiniMax's base URL. Every call routes
 * through the shared concurrency queue (see ./queue).
 */

export const MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-M3";

type Global = typeof globalThis & { __abranyMinimax?: Anthropic };
const g = globalThis as Global;

export function getClient(): Anthropic {
  if (g.__abranyMinimax) return g.__abranyMinimax;
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY is not set");
  const client = new Anthropic({
    apiKey,
    // NB: the Anthropic SDK appends `/v1/messages`, so the base must NOT include `/v1`.
    baseURL: process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/anthropic",
  });
  g.__abranyMinimax = client;
  return client;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Non-streaming completion (used for structured plan generation). Queued + retried. */
export async function complete(params: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  return withQueue(async () => {
    const res = await getClient().messages.create({
      model: MODEL,
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
 * yields text deltas. The slot is released when iteration finishes or aborts.
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
    const stream = await getClient().messages.create(
      {
        model: MODEL,
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
