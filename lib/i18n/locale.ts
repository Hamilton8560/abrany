/**
 * UI locale resolution. The interface is translated into a small set of locales
 * (see UI_LOCALES); the much larger content-language list in lib/languages
 * drives AI generation. A user whose account language has no UI dictionary yet
 * (say French) gets the English interface but French content.
 *
 * Precedence — the ACCOUNT setting always wins:
 *   1. signed-in user's account language (users.language)
 *   2. the `abrany_lang` cookie (remembered from the last signed-in session, so
 *      the login / reset-password screens match what the person chose)
 *   3. the browser's Accept-Language (only for people we know nothing about)
 *   4. English
 */

export const UI_LOCALES = ["en", "es"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_UI_LOCALE: UiLocale = "en";
export const LOCALE_COOKIE = "abrany_lang";

/** BCP-47 tag used for dates/numbers: neutral Latin American Spanish. */
export const INTL_TAG: Record<UiLocale, string> = { en: "en-US", es: "es-419" };

/** Normalise any language tag ("es-SV", "ES", "es_419") to a UI locale, or null. */
export function toUiLocale(raw: string | null | undefined): UiLocale | null {
  if (!raw) return null;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  return (UI_LOCALES as readonly string[]).includes(base) ? (base as UiLocale) : null;
}

/** Best UI locale from an Accept-Language header, honouring q-values. */
export function fromAcceptLanguage(header: string | null | undefined): UiLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const r of ranked) {
    const l = toUiLocale(r.tag);
    if (l) return l;
  }
  return null;
}

export function resolveUiLocale(opts: {
  /** The signed-in user's account language, if anyone is signed in. */
  account?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): UiLocale {
  // A signed-in user's choice is final — even "fr" (no UI dictionary) means the
  // English UI, never the browser's language.
  if (opts.account) return toUiLocale(opts.account) ?? DEFAULT_UI_LOCALE;
  return toUiLocale(opts.cookie) ?? fromAcceptLanguage(opts.acceptLanguage) ?? DEFAULT_UI_LOCALE;
}
