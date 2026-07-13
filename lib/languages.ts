/**
 * Curated language list shared by client (Settings dropdown) and server
 * (generation directive + input detection). Each entry maps our short code to a
 * display name, its native label, and the ISO 639-3 code `franc` returns — so we
 * can both force output into a language and detect when the user is typing in a
 * different one.
 */

export type Language = { code: string; name: string; native: string; iso3: string };

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English", iso3: "eng" },
  { code: "es", name: "Spanish", native: "Español", iso3: "spa" },
  { code: "fr", name: "French", native: "Français", iso3: "fra" },
  { code: "de", name: "German", native: "Deutsch", iso3: "deu" },
  { code: "it", name: "Italian", native: "Italiano", iso3: "ita" },
  { code: "pt", name: "Portuguese", native: "Português", iso3: "por" },
  { code: "nl", name: "Dutch", native: "Nederlands", iso3: "nld" },
  { code: "ru", name: "Russian", native: "Русский", iso3: "rus" },
  { code: "ar", name: "Arabic", native: "العربية", iso3: "arb" },
  { code: "zh", name: "Chinese", native: "中文", iso3: "cmn" },
  { code: "ja", name: "Japanese", native: "日本語", iso3: "jpn" },
  { code: "ko", name: "Korean", native: "한국어", iso3: "kor" },
  { code: "hi", name: "Hindi", native: "हिन्दी", iso3: "hin" },
  { code: "tr", name: "Turkish", native: "Türkçe", iso3: "tur" },
  { code: "pl", name: "Polish", native: "Polski", iso3: "pol" },
  { code: "sv", name: "Swedish", native: "Svenska", iso3: "swe" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", iso3: "vie" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", iso3: "ind" },
  { code: "th", name: "Thai", native: "ไทย", iso3: "tha" },
  { code: "uk", name: "Ukrainian", native: "Українська", iso3: "ukr" },
];

export const DEFAULT_LANG = "en";

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
const BY_ISO3 = new Map(LANGUAGES.map((l) => [l.iso3, l]));

export function isSupported(code: string): boolean {
  return BY_CODE.has(code);
}

export function languageName(code: string | null | undefined): string {
  return (code && BY_CODE.get(code)?.name) || "English";
}

export function languageByIso3(iso3: string): Language | undefined {
  return BY_ISO3.get(iso3);
}

/** System-prompt line that pins all generation to the user's language. */
export function languageDirective(code: string | null | undefined): string {
  const name = languageName(code);
  return `Write your entire response in ${name}. Keep everything — headings, lists, examples, and diagram labels — in ${name}, regardless of the language used in the input. Proper nouns and code may stay in their original form.`;
}
