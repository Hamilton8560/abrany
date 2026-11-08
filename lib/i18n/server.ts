import { cookies, headers } from "next/headers";
import { getAuthState } from "../auth";
import { makeT, type TFn } from "./index";
import { LOCALE_COOKIE, resolveUiLocale, type UiLocale } from "./locale";

/** The UI locale for this request: account language → cookie → Accept-Language → en. */
export async function getUiLocale(): Promise<UiLocale> {
  const [{ effective }, jar, h] = await Promise.all([getAuthState(), cookies(), headers()]);
  return resolveUiLocale({
    account: effective?.language || (effective ? "en" : null),
    cookie: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  });
}

/** Server-component translator: const t = await getServerT(); */
export async function getServerT(): Promise<TFn> {
  return makeT(await getUiLocale());
}
