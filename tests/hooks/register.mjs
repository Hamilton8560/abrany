// Preloaded via `node --import` (see package.json's "test" script) so this registers BEFORE
// `node --test` resolves any test file's module graph — module.register()'d hooks only apply to
// resolution that happens after registration, and static ESM imports resolve the whole reachable
// graph before any module (including tests/setup.ts) evaluates its top-level code.
//
// DATA_DIR isolation lives HERE (not just in tests/setup.ts) so it's structural rather than
// by-convention: this file is guaranteed to run before any test file's module graph resolves
// (via `--import`), regardless of whether a given test file remembers to `import "./setup.ts"`
// first. Without this, a forgetful test file would silently read/write the real DB at
// .data/abrany.db. `||=` makes this a no-op if DATA_DIR is already set (e.g. by a CI harness).
import { register } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "abrany-test-"));

register("./resolve-ts.mjs", import.meta.url);
