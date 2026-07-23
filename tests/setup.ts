// Imported FIRST in every test file. ES modules evaluate in import-source order, so setting
// DATA_DIR here runs before lib/db.ts is evaluated (its DB_PATH const reads DATA_DIR at import).
// `node --test` runs each test file in its own process, so each file gets a fresh database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "abrany-test-"));
