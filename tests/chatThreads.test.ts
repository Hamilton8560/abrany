import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createUser,
  createGoal,
  getOrCreateDefaultThread,
  createThread,
  addMessage,
  recentHistory,
} from "../lib/repo.ts";

let n = 0;

test("each goal gets its own thread; general chat is separate", () => {
  const u = createUser(`chat${++n}@example.com`, "hash");
  const g1 = createGoal(u.id, "Spanish");
  const g2 = createGoal(u.id, "Welding");
  const general = getOrCreateDefaultThread(u.id, null);
  const t1 = getOrCreateDefaultThread(u.id, g1.id);
  const t2 = getOrCreateDefaultThread(u.id, g2.id);
  assert.notEqual(general, t1);
  assert.notEqual(t1, t2);
  assert.equal(getOrCreateDefaultThread(u.id, g1.id), t1, "stable on repeat");
  assert.equal(getOrCreateDefaultThread(u.id, null), general);
});

test("a new conversation starts a fresh thread that becomes the default", () => {
  const u = createUser(`chat${++n}@example.com`, "hash");
  const g = createGoal(u.id, "Math");
  const first = getOrCreateDefaultThread(u.id, g.id);
  addMessage(first, "user", "hi");
  const fresh = createThread(u.id, g.id);
  assert.notEqual(fresh, first);
  assert.equal(getOrCreateDefaultThread(u.id, g.id), fresh);
  assert.equal(recentHistory(fresh).length, 0);
});

test("recentHistory caps by message count and by characters, newest kept", () => {
  const u = createUser(`chat${++n}@example.com`, "hash");
  const t = getOrCreateDefaultThread(u.id, null);
  for (let i = 0; i < 60; i++) addMessage(t, i % 2 ? "assistant" : "user", `m${i} ${"x".repeat(1000)}`);
  const capped = recentHistory(t, { maxMessages: 40, maxChars: 12_000 });
  assert.ok(capped.length <= 12, `got ${capped.length}`);
  assert.equal(capped[capped.length - 1].content.startsWith("m59"), true);
  assert.equal(capped[0].role, "user", "history must start on a user turn");
});
