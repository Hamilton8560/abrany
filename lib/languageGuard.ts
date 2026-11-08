import { franc } from "franc-min";

/**
 * Output-language guard for AI generation. The models we run (MiniMax, Kimi…)
 * occasionally drift mid-answer: a Spanish lesson grows a Chinese phrase or a
 * paragraph of English. This module detects that drift (so complete() can retry)
 * and, as a last resort, strips stray foreign-script runs so a learner never sees
 * them.
 *
 * Only "leaks" count: a script the PROMPT itself uses (e.g. a lesson about
 * Japanese vocabulary) is allowed through, and code blocks / inline code are
 * never inspected or touched.
 */

/** Target languages written in Latin script (everything else is skipped). */
const LATIN = new Set(["en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "tr", "vi", "id"]);

const SCRIPTS: Record<string, RegExp> = {
  han: /\p{Script=Han}/u,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  hangul: /\p{Script=Hangul}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  arabic: /\p{Script=Arabic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  thai: /\p{Script=Thai}/u,
};

/** Fenced blocks and `inline code` are left exactly as the model wrote them. */
const CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

function proseOnly(text: string): string {
  return text.replace(CODE, " ");
}

function scriptsIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const [name, re] of Object.entries(SCRIPTS)) if (re.test(text)) found.add(name);
  return found;
}

/** Scripts that leaked into `output` but were not present in the prompt. */
export function leakedScripts(output: string, lang: string, prompt = ""): string[] {
  if (!LATIN.has(lang)) return [];
  const allowed = scriptsIn(prompt);
  return [...scriptsIn(proseOnly(output))].filter((s) => !allowed.has(s));
}

/**
 * Human-readable sentences of the output: JSON keys, markdown syntax, URLs and
 * code removed, split into lines/sentences long enough to identify reliably.
 */
function sentences(text: string): string[] {
  return proseOnly(text)
    .replace(/"[\w$-]+"\s*:/g, " ") // JSON keys
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_>|[\]{}()"]/g, " ")
    .split(/(?<=[.!?¿¡])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 60);
}

/**
 * For a non-English target: the share of long sentences that are clearly English.
 * (English targets skip this — quoting another language is normal there.)
 */
export function englishShare(output: string, lang: string): number {
  if (lang === "en" || !LATIN.has(lang)) return 0;
  const list = sentences(output);
  if (list.length < 2) return 0;
  const english = list.filter((s) => franc(s, { minLength: 40 }) === "eng").length;
  return english / list.length;
}

export type Leak = { scripts: string[]; englishShare: number };

/** null = the output is in the requested language; otherwise what leaked. */
export function detectLanguageLeak(output: string, lang: string | null | undefined, prompt = ""): Leak | null {
  if (!lang) return null;
  const scripts = leakedScripts(output, lang, prompt);
  const share = englishShare(output, lang);
  // a stray English sentence is tolerable (a quoted term, a product name); a
  // quarter of the text in English is not
  if (!scripts.length && share < 0.25) return null;
  return { scripts, englishShare: share };
}

/**
 * Last-resort cleanup: remove runs of leaked foreign script from prose (never
 * from code), then tidy the spacing/punctuation the removal leaves behind.
 */
export function stripLeakedScripts(output: string, lang: string | null | undefined, prompt = ""): string {
  if (!lang) return output;
  const leaked = leakedScripts(output, lang, prompt);
  if (!leaked.length) return output;
  const classes = leaked.map((s) => SCRIPTS[s].source.replace(/^\[|\]$/g, "")).join("");
  // a run of leaked chars plus any CJK punctuation/fullwidth forms glued to it
  const run = new RegExp(`[${classes}\\u3000-\\u303f\\uff00-\\uffef]+`, "gu");
  return output
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part // captured code segment
        : part
            .replace(run, " ")
            .replace(/\(\s*\)/g, "")
            .replace(/[ \t]{2,}/g, " ")
            .replace(/ +([,.;:!?])/g, "$1"),
    )
    .join("");
}

/** System-prompt addendum for the retry after a detected leak. */
export function leakCorrection(langName: string, leak: Leak): string {
  const what = [
    leak.scripts.length ? "words in another writing system (e.g. Chinese characters)" : "",
    leak.englishShare >= 0.25 ? "sentences in English" : "",
  ]
    .filter(Boolean)
    .join(" and ");
  return `IMPORTANT — LANGUAGE CHECK FAILED: a previous attempt at this answer contained ${what}. Write the whole answer again, 100% in ${langName}. Do not use any other language or writing system anywhere in learner-facing text.`;
}
