// Imported FIRST in every test file. ES modules evaluate in import-source order, so setting
// DATA_DIR here runs before lib/db.ts is evaluated (its DB_PATH const reads DATA_DIR at import).
// `node --test` runs each test file in its own process, so each file gets a fresh database.
//
// Under `npm test`, tests/hooks/register.mjs (preloaded via `node --import`) already sets
// DATA_DIR before this file — or any test file — ever resolves, so this is a no-op there. The
// `||=` here is a fallback for direct `node --test <file>` invocations that bypass register.mjs,
// and makes this file idempotent/harmless either way.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "abrany-test-"));
