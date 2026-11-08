import { DEFAULT_UI_LOCALE, INTL_TAG, toUiLocale, type UiLocale } from "./locale";
import { ES } from "./es/index";

/**
 * Tiny dictionary-based i18n. Keys ARE the English source strings, so English
 * needs no dictionary and a missing Spanish entry degrades to readable English
 * instead of a raw key. `tests/i18n.test.ts` statically collects every t("…")
 * literal in the app and fails if Spanish is missing any of them.
 *
 * Placeholders: t("{n} lessons", { n: 3 }). Plurals: pass `{ n }` and give a
 * "key|plural" pair — see plural().
 */

export type Vars = Record<string, string | number>;
export type TFn = (key: string, vars?: Vars) => string;

const DICTS: Record<UiLocale, Record<string, string>> = { en: {}, es: ES };

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function translate(locale: string | null | undefined, key: string, vars?: Vars): string {
  const l = toUiLocale(locale) ?? DEFAULT_UI_LOCALE;
  const hit = DICTS[l][key];
  return interpolate(hit ?? key, vars);
}

export function makeT(locale: string | null | undefined): TFn {
  return (key, vars) => translate(locale, key, vars);
}

/** Pick singular/plural English keys by count, then translate. */
/**
 * Marks a string as a translation key WITHOUT translating it yet — for labels
 * defined at module level (nav items, option lists). Translate at render with
 * t(item.label). The completeness test collects msg("…") literals too.
 */
export const msg = (s: string): string => s;

export function plural(t: TFn, n: number, one: string, other: string, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

export function hasTranslation(locale: UiLocale, key: string): boolean {
  return locale === "en" || key in DICTS[locale];
}

export function dictionary(locale: UiLocale): Readonly<Record<string, string>> {
  return DICTS[locale];
}

/* ── dates & numbers in the UI locale ─────────────────────────── */

/** sqlite stores UTC "YYYY-MM-DD HH:MM:SS"; ISO strings pass through. */
export function parseDbDate(iso: string): Date {
  const s = iso.includes("T") ? iso : iso.replace(" ", "T");
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || !s.includes("T") ? s : s + "Z");
}

export function fmtDate(locale: string | null | undefined, d: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === "string" ? parseDbDate(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "";
  const tag = INTL_TAG[toUiLocale(locale) ?? DEFAULT_UI_LOCALE];
  return date.toLocaleDateString(tag, opts ?? { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(locale: string | null | undefined, d: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === "string" ? parseDbDate(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "";
  const tag = INTL_TAG[toUiLocale(locale) ?? DEFAULT_UI_LOCALE];
  return date.toLocaleString(tag, opts ?? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtNumber(locale: string | null | undefined, n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(INTL_TAG[toUiLocale(locale) ?? DEFAULT_UI_LOCALE], opts);
}

export { type UiLocale } from "./locale";
