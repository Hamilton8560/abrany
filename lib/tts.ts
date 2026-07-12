/**
 * Pluggable text-to-speech. The active backend is chosen by env `TTS_PROVIDER`
 * so the app is "dynamically capable": free browser voice today, MiniMax /
 * Kokoro / OpenAI the moment their creds are added — no code change, same
 * "Listen" button. Any provider failure returns null so the client falls back
 * to the browser's built-in speech (always free, always available).
 */

export type TtsResult = { audio: Buffer; mime: string };

export function activeProvider(): "browser" | "kokoro" | "openai" | "minimax" {
  const p = (process.env.TTS_PROVIDER ?? "browser").toLowerCase();
  if (p === "minimax" && process.env.MINIMAX_TTS_API_KEY && process.env.MINIMAX_GROUP_ID)
    return "minimax";
  if (p === "kokoro" && process.env.KOKORO_URL) return "kokoro";
  if (p === "openai" && process.env.OPENAI_API_KEY) return "openai";
  return "browser";
}

/** True when a real server-side voice is configured (so the client should request audio). */
export function hasServerVoice(): boolean {
  return activeProvider() !== "browser";
}

export async function synthesizeSpeech(text: string): Promise<TtsResult | null> {
  const provider = activeProvider();
  const clean = text.slice(0, 8000); // cap per-call cost/latency
  try {
    if (provider === "minimax") return await minimaxT2A(clean);
    if (provider === "kokoro") return await openAiCompatible(clean, process.env.KOKORO_URL!, undefined, process.env.KOKORO_VOICE ?? "af_heart", "kokoro");
    if (provider === "openai")
      return await openAiCompatible(clean, "https://api.openai.com/v1", process.env.OPENAI_API_KEY, process.env.OPENAI_TTS_VOICE ?? "alloy", "tts-1");
  } catch {
    return null; // → client falls back to free browser TTS
  }
  return null;
}

/** OpenAI-compatible /audio/speech (works for OpenAI and self-hosted Kokoro servers). */
async function openAiCompatible(
  text: string,
  baseUrl: string,
  apiKey: string | undefined,
  voice: string,
  model: string,
): Promise<TtsResult | null> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { audio: buf, mime: "audio/mpeg" };
}

/** MiniMax T2A v2 — returns hex-encoded audio. Activate by adding the media key + GroupId. */
async function minimaxT2A(text: string): Promise<TtsResult | null> {
  const key = process.env.MINIMAX_TTS_API_KEY!;
  const group = process.env.MINIMAX_GROUP_ID!;
  const res = await fetch(`https://api.minimax.io/v1/t2a_v2?GroupId=${group}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.MINIMAX_TTS_MODEL ?? "speech-02-hd",
      text,
      stream: false,
      voice_setting: {
        voice_id: process.env.MINIMAX_TTS_VOICE ?? "English_expressive_narrator",
        speed: 1.0,
        vol: 1.0,
        pitch: 0,
      },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { audio?: string } };
  const hex = data.data?.audio;
  if (!hex) return null;
  return { audio: Buffer.from(hex, "hex"), mime: "audio/mpeg" };
}
