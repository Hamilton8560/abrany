// Preloaded via `node --import` (see package.json's "test" script) so this registers BEFORE
// `node --test` resolves any test file's module graph — module.register()'d hooks only apply to
// resolution that happens after registration, and static ESM imports resolve the whole reachable
// graph before any module (including tests/setup.ts) evaluates its top-level code.
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
