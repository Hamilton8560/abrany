import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUser } from "../lib/repo.ts";
import { createResetToken, consumeResetToken } from "../lib/passwordReset.ts";
import { getDb } from "../lib/db.ts";

let n = 0;
const mk = () => createUser(`reset${++n}@example.com`, "hash");

test("create → consume returns the user once, then never again", () => {
  const u = mk();
  const { token } = createResetToken(u.id);
  assert.equal(consumeResetToken(token), u.id);
  assert.equal(consumeResetToken(token), null, "single use");
});

test("unknown and expired tokens are rejected", () => {
  const u = mk();
  assert.equal(consumeResetToken("nope"), null);
  const { token, id } = createResetToken(u.id);
  getDb().prepare("UPDATE password_reset_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(id);
  assert.equal(consumeResetToken(token), null);
});

test("issuing a new token invalidates the previous one", () => {
  const u = mk();
  const first = createResetToken(u.id);
  const second = createResetToken(u.id);
  assert.equal(consumeResetToken(first.token), null);
  assert.equal(consumeResetToken(second.token), u.id);
});
