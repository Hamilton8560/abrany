import { franc } from "franc-min";
import { languageByIso3, languageName } from "./languages";

/**
 * Best-effort language detection for user input, limited to the languages we
 * support. Fails OPEN: short or ambiguous text returns null so we never block or
 * mis-prompt a switch on a bad guess — generation still happens in the user's
 * chosen language regardless.
 */
export function detectLanguage(text: string): string | null {
  const t = text.trim();
  if (t.length < 12) return null; // too short to call reliably
  const iso3 = franc(t, { minLength: 12 });
  if (iso3 === "und") return null;
  return languageByIso3(iso3)?.code ?? null;
}

/** Mismatch info when the text is clearly in a supported language ≠ preference. */
export function languageMismatch(
  text: string,
  prefCode: string,
): { code: string; name: string } | null {
  const detected = detectLanguage(text);
  if (!detected || detected === prefCode) return null;
  return { code: detected, name: languageName(detected) };
}
