import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguageLeak, stripLeakedScripts, leakedScripts } from "../lib/languageGuard.ts";
import { languageDirective, languageCodeByName } from "../lib/languages.ts";
import { complete, streamText, withLlm } from "../lib/minimax.ts";

const ES_LESSON =
  "# Cómo saludar a un socio nuevo\n\nCuando un socio entra por primera vez, sonríe y preséntate con tu nombre. " +
  "Pregúntale cuál es su meta principal para poder recomendarle la membresía adecuada. " +
  "Recuerda que la primera impresión define si la persona vuelve la próxima semana.";

/* ── prompt language ─────────────────────────────────────────── */

test("the language directive pins Spanish, forbids mixing, and asks for Latin American usage", () => {
  const d = languageDirective("es");
  assert.match(d, /entire response in Spanish/);
  assert.match(d, /Never mix in another language or writing system/);
  assert.match(d, /Latin American Spanish/);
  assert.match(d, /"tú"/);
  assert.match(d, /JSON keys/); // structured output must keep its field names
  assert.doesNotMatch(languageDirective("en"), /Latin American/);
  assert.equal(languageCodeByName("Spanish"), "es");
  assert.equal(languageCodeByName("Español"), "es");
});

/* ── leak detection & cleanup ────────────────────────────────── */

test("clean Spanish passes; Chinese characters and English paragraphs are leaks", () => {
  assert.equal(detectLanguageLeak(ES_LESSON, "es"), null);
  const zh = ES_LESSON.replace("sonríe", "sonríe 微笑");
  assert.deepEqual(detectLanguageLeak(zh, "es")?.scripts, ["han"]);
  const en =
    ES_LESSON +
    "\n\nWhen a member walks in for the first time, smile and introduce yourself by name right away. " +
    "Ask them about their main goal so you can recommend the right membership for them today. " +
    "Remember that the first impression decides whether this person comes back next week or not.";
  assert.ok((detectLanguageLeak(en, "es")?.englishShare ?? 0) >= 0.25);
});

test("a script the prompt itself uses is not a leak (e.g. a lesson about Japanese)", () => {
  const out = "La palabra 友達 significa amigo y se usa todo el tiempo en conversaciones informales con gente cercana.";
  assert.deepEqual(leakedScripts(out, "es", "Enséñame la palabra 友達"), []);
  assert.deepEqual(leakedScripts(out, "es", "Enséñame japonés"), ["han"]);
});

test("code blocks are never inspected or stripped", () => {
  const out = "Ejemplo de código:\n\n```js\nconst saludo = \"你好\";\n```\n\nEso es todo.";
  assert.equal(detectLanguageLeak(out, "es"), null);
  assert.equal(stripLeakedScripts(out, "es"), out);
});

test("leaked Chinese is stripped from prose and the sentence stays readable", () => {
  assert.equal(stripLeakedScripts("Sonríe（微笑）y preséntate 你好 con tu nombre.", "es"), "Sonríe y preséntate con tu nombre.");
  assert.equal(stripLeakedScripts("Hola 你好", "en"), "Hola ");
  assert.equal(stripLeakedScripts("Hola 你好", null), "Hola 你好"); // no target → untouched
});

test("JSON keys don't count as English", () => {
  const json = JSON.stringify({
    question: "¿Qué debes preguntarle a un socio nuevo cuando entra por primera vez al gimnasio?",
    options: ["Su meta principal para recomendarle la membresía adecuada", "Nada, solo cobrarle la mensualidad"],
    explanation: "Conocer su meta te permite orientarlo desde el primer día y que se sienta bienvenido.",
  });
  assert.equal(detectLanguageLeak(json, "es"), null);
});

/* ── complete()/streamText() end to end with a stubbed provider ── */

type Captured = { system: string };

/** Stub fetch as an OpenAI-compatible SSE endpoint returning `replies` in order. */
function stubProvider(replies: string[], seen: Captured[]) {
  const orig = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages: { role: string; content: string }[] };
    seen.push({ system: body.messages.find((m) => m.role === "system")?.content ?? "" });
    const text = replies[Math.min(i++, replies.length - 1)];
    const sse =
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n` +
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n` +
      "data: [DONE]\n\n";
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

// the SDK client is cached per key and binds fetch at construction → a fresh key per test
let n = 0;
const freshCreds = () => ({ provider: "deepseek" as const, key: `test-key-${++n}`, model: "m" });

test("complete() sends the Spanish directive and retries once when Chinese leaks in", async () => {
  const seen: Captured[] = [];
  const restore = stubProvider([ES_LESSON.replace("sonríe", "sonríe 微笑"), ES_LESSON], seen);
  try {
    const out = await withLlm(freshCreds(), () => complete({ system: "You are a coach.", messages: [{ role: "user", content: "Enséñame a saludar" }] }), "es");
    assert.equal(out, ES_LESSON);
    assert.equal(seen.length, 2);
    assert.match(seen[0].system, /entire response in Spanish/);
    assert.match(seen[1].system, /LANGUAGE CHECK FAILED/);
  } finally {
    restore();
  }
});

test("complete() strips the leak if the retry also drifts", async () => {
  const seen: Captured[] = [];
  const restore = stubProvider(["Sonríe 微笑 y preséntate con tu nombre cuando llegue alguien nuevo al gimnasio."], seen);
  try {
    const out = await withLlm(freshCreds(), () => complete({ system: "s", messages: [{ role: "user", content: "hola" }] }), "es");
    assert.equal(out, "Sonríe y preséntate con tu nombre cuando llegue alguien nuevo al gimnasio.");
    assert.equal(seen.length, 2);
  } finally {
    restore();
  }
});

test("English users are not retried or altered", async () => {
  const seen: Captured[] = [];
  const restore = stubProvider(["Smile and introduce yourself."], seen);
  try {
    const out = await withLlm(freshCreds(), () => complete({ system: "s", messages: [{ role: "user", content: "hi" }] }), "en");
    assert.equal(out, "Smile and introduce yourself.");
    assert.equal(seen.length, 1);
    assert.match(seen[0].system, /entire response in English/);
  } finally {
    restore();
  }
});

test("streamText() filters leaked Chinese out of the visible coach reply", async () => {
  const seen: Captured[] = [];
  const restore = stubProvider(["Claro, te explico 我们 cómo hacerlo."], seen);
  try {
    let text = "";
    await withLlm(freshCreds(), async () => {
      for await (const c of streamText({ system: "s", messages: [{ role: "user", content: "hola" }] })) if (c.kind === "text") text += c.text;
    }, "es");
    assert.equal(text, "Claro, te explico cómo hacerlo.");
    assert.match(seen[0].system, /Spanish/);
  } finally {
    restore();
  }
});
