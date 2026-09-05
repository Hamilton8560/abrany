import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUser, setUserAiCreds, getUser } from "../lib/repo.ts";
import { createOrg, addMemberByEmail } from "../lib/org.ts";
import { resolveUserLlm } from "../lib/minimax.ts";

let n = 0;
const mk = (owner = false) => createUser(`ai${++n}@example.com`, "hash", owner);

test("owner always runs on server keys", () => {
  const owner = mk(true);
  assert.deepEqual(resolveUserLlm(owner), { mode: "server" });
});

test("a user with their own key runs on it", () => {
  const u = mk();
  setUserAiCreds(u.id, "deepseek", "sk-test", "");
  const r = resolveUserLlm(getUser(u.id)!);
  assert.equal(r.mode, "byo");
  if (r.mode === "byo") assert.equal(r.creds.provider, "deepseek");
});

test("a keyless loner has no AI", () => {
  const u = mk();
  assert.deepEqual(resolveUserLlm(u), { mode: "nokey" });
});

test("an employee of the platform owner's org inherits the server keys", async () => {
  const owner = mk(true);
  const org = createOrg(owner.id, "American Iron");
  const r = await addMemberByEmail(org.id, `emp${n}@example.com`);
  assert.equal(r.status, "created");
  const emp = getUser((await import("../lib/repo.ts")).getUserByEmail(`emp${n}@example.com`)!.id)!;
  assert.deepEqual(resolveUserLlm(emp), { mode: "server" });
});

test("an employee of a BYO-key company runs on the company's key", async () => {
  const boss = mk();
  setUserAiCreds(boss.id, "openrouter", "sk-company", "deepseek/deepseek-chat");
  const org = createOrg(boss.id, "Acme");
  const existing = mk();
  await addMemberByEmail(org.id, existing.email);
  const r = resolveUserLlm(getUser(existing.id)!);
  assert.equal(r.mode, "byo");
  if (r.mode === "byo") {
    assert.equal(r.creds.provider, "openrouter");
    assert.equal(r.creds.key, "sk-company");
  }
});

test("an employee of a keyless company still has no AI", async () => {
  const boss = mk();
  const org = createOrg(boss.id, "Broke Co");
  const emp = mk();
  await addMemberByEmail(org.id, emp.email);
  assert.deepEqual(resolveUserLlm(getUser(emp.id)!), { mode: "nokey" });
});
