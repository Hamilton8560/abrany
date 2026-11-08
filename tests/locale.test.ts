import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUiLocale, fromAcceptLanguage, toUiLocale } from "../lib/i18n/locale.ts";

test("the account language wins over cookie and browser", () => {
  assert.equal(resolveUiLocale({ account: "es", cookie: "en", acceptLanguage: "en-US,en;q=0.9" }), "es");
  assert.equal(resolveUiLocale({ account: "en", cookie: "es", acceptLanguage: "es-SV,es;q=0.9" }), "en");
});

test("an account language without a UI dictionary gets English, never the browser's", () => {
  assert.equal(resolveUiLocale({ account: "fr", acceptLanguage: "es-SV" }), "en");
});

test("signed-out: cookie, then Accept-Language, then English", () => {
  assert.equal(resolveUiLocale({ cookie: "es", acceptLanguage: "en-US" }), "es");
  assert.equal(resolveUiLocale({ acceptLanguage: "es-SV,es;q=0.9,en;q=0.8" }), "es");
  assert.equal(resolveUiLocale({ acceptLanguage: "fr-FR,fr;q=0.9" }), "en");
  assert.equal(resolveUiLocale({}), "en");
});

test("Accept-Language honours q-values and regional tags", () => {
  assert.equal(fromAcceptLanguage("en;q=0.5,es-419;q=0.9"), "es");
  assert.equal(fromAcceptLanguage("de-DE,en;q=0.1"), "en");
  assert.equal(fromAcceptLanguage("es;q=0"), null);
  assert.equal(toUiLocale("ES_sv"), "es");
  assert.equal(toUiLocale("pt"), null);
});
