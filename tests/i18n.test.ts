import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ES, ES_FRAGMENTS } from "../lib/i18n/es/index.ts";
import { translate, interpolate, fmtDate, plural, makeT } from "../lib/i18n/index.ts";

/**
 * Dictionary completeness: every string the app passes to t("…") / msg("…") /
 * plural(t, n, "…", "…"), and every literal API error, must have a Spanish entry.
 * Keys are the English source strings, so English needs no dictionary.
 */

const ROOT = join(import.meta.dirname, "..");
const SCAN = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !p.includes(`${join("lib", "i18n")}`)) out.push(p);
  }
  return out;
}

const FILES = SCAN.flatMap((d) => walk(join(ROOT, d)));

/** Unescape a JS string literal body ("\"" → '"', "\n" → newline). */
const unescape = (s: string) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");

const STR = String.raw`(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\x60((?:\\.|[^\x60\\$])*)\x60)`;
const CALL = new RegExp(String.raw`(?<![\w.$])(?:t|msg)\(\s*` + STR, "g");
const PLURAL = new RegExp(String.raw`(?<![\w.$])plural\(\s*t\s*,[^,]+,\s*` + STR + String.raw`\s*,\s*` + STR, "g");
const API_ERROR = new RegExp(String.raw`\berror:\s*` + STR, "g");

function collect(): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  const add = (k: string, file: string) => {
    const list = keys.get(k) ?? [];
    list.push(relative(ROOT, file));
    keys.set(k, list);
  };
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(CALL)) add(unescape(m[1] ?? m[2] ?? m[3]), f);
    for (const m of src.matchAll(PLURAL)) {
      add(unescape(m[1] ?? m[2] ?? m[3]), f);
      add(unescape(m[4] ?? m[5] ?? m[6]), f);
    }
    // literal JSON errors from API routes are shown to the user via lib/client api()
    if (f.includes(join("app", "api")) || f.endsWith(join("lib", "auth.ts")) || f.endsWith(join("lib", "minimax.ts"))) {
      for (const m of src.matchAll(API_ERROR)) add(unescape(m[1] ?? m[2] ?? m[3]), f);
    }
  }
  return keys;
}

test("every UI string has a Spanish translation", () => {
  const keys = collect();
  assert.ok(keys.size > 200, `expected the app to use many t() keys, found ${keys.size}`);
  const missing = [...keys].filter(([k]) => !(k in ES)).map(([k, files]) => `${JSON.stringify(k)}  (${files[0]})`);
  assert.deepEqual(missing, [], `Spanish is missing ${missing.length} keys:\n${missing.join("\n")}`);
});

test("t() is never called with an interpolated template literal", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?<![\w.$])t\(\s*`[^`]*\$\{/g)) bad.push(`${relative(ROOT, f)}: ${m[0]}`);
  }
  assert.deepEqual(bad, [], "use t(\"… {name} …\", { name }) instead of template literals");
});

test("Spanish entries keep every {placeholder} of the English key", () => {
  const broken = Object.entries(ES).filter(([en, es]) => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    return ph(en) !== ph(es);
  });
  assert.deepEqual(broken.map(([k]) => k), []);
});

test("fragments never disagree on a shared key", () => {
  const seen = new Map<string, { frag: string; value: string }>();
  const clashes: string[] = [];
  for (const [frag, dict] of Object.entries(ES_FRAGMENTS)) {
    for (const [k, v] of Object.entries(dict)) {
      const prev = seen.get(k);
      if (prev && prev.value !== v) clashes.push(`${JSON.stringify(k)}: ${prev.frag}=${JSON.stringify(prev.value)} vs ${frag}=${JSON.stringify(v)}`);
      else seen.set(k, { frag, value: v });
    }
  }
  assert.deepEqual(clashes, []);
});

test("Spanish entries are not left in English or empty", () => {
  // short tokens (OK, XP, IA…) may legitimately match; flag only real sentences
  const untranslated = Object.entries(ES).filter(([en, es]) => !es.trim() || (en === es && en.split(" ").length >= 3));
  assert.deepEqual(untranslated.map(([k]) => k), []);
});

test("Spanish avoids Spain-only forms (the staff are in El Salvador)", () => {
  const spainOnly = /\b(vosotros|vuestr[oa]s?|ordenador|móvil|coger|vale\b|habéis|tenéis|podéis|queréis|sois)\b/i;
  const hits = Object.entries(ES).filter(([, es]) => spainOnly.test(es));
  assert.deepEqual(hits.map(([k, v]) => `${k} → ${v}`), []);
});

test("translate falls back to English and interpolates", () => {
  assert.equal(translate("es", "Save"), "Guardar");
  assert.equal(translate("en", "Save"), "Save");
  assert.equal(translate("fr", "Save"), "Save"); // no French UI yet → English
  assert.equal(translate("es", "a key nobody translated"), "a key nobody translated");
  assert.equal(interpolate("{n} of {total}", { n: 2, total: 5 }), "2 of 5");
  assert.equal(translate("es", "Request failed ({status})", { status: 500 }), "La solicitud falló (500)");
  const t = makeT("en");
  assert.equal(plural(t, 1, "{n} item", "{n} items"), "1 item");
  assert.equal(plural(t, 3, "{n} item", "{n} items"), "3 items");
});

test("dates format in the UI locale", () => {
  const d = "2026-03-05 12:00:00";
  assert.match(fmtDate("es", d, { month: "long", day: "numeric" }), /5 de marzo/);
  assert.match(fmtDate("en", d, { month: "long", day: "numeric" }), /March 5/);
});
