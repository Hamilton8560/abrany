"use client";

import { createContext, useContext, useMemo } from "react";
import { fmtDate, fmtDateTime, fmtNumber, makeT, type TFn } from "./index";
import { DEFAULT_UI_LOCALE, type UiLocale } from "./locale";

type Ctx = {
  locale: UiLocale;
  t: TFn;
  date: (d: Date | string, opts?: Intl.DateTimeFormatOptions) => string;
  dateTime: (d: Date | string, opts?: Intl.DateTimeFormatOptions) => string;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
};

const build = (locale: UiLocale): Ctx => ({
  locale,
  t: makeT(locale),
  date: (d, o) => fmtDate(locale, d, o),
  dateTime: (d, o) => fmtDateTime(locale, d, o),
  num: (n, o) => fmtNumber(locale, n, o),
});

const I18nContext = createContext<Ctx>(build(DEFAULT_UI_LOCALE));

/** Set once in the root layout from the server-resolved locale (account wins). */
export function I18nProvider({ locale, children }: { locale: UiLocale; children: React.ReactNode }) {
  const value = useMemo(() => build(locale), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(I18nContext);
}

/** Shorthand: const t = useT(); t("Save") */
export function useT(): TFn {
  return useContext(I18nContext).t;
}
