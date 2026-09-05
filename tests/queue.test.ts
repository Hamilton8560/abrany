import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireSlot, queueState } from "../lib/queue.ts";

// MINIMAX_MAX_CONCURRENCY defaults to 2 in tests: background may hold at most 1 slot.

test("background work never takes the last slot; interactive jumps the queue", async () => {
  const order: string[] = [];
  const bg1 = await acquireSlot("background"); // holds the only background-eligible slot
  order.push("bg1");
  // a second background request must wait even though a slot is free…
  let bg2Granted = false;
  const bg2 = acquireSlot("background").then((r) => {
    bg2Granted = true;
    order.push("bg2");
    return r;
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(bg2Granted, false, "second background job waits while one slot is kept free");
  assert.equal(queueState().active, 1);
  // …but an interactive request takes that free slot immediately
  const ia = await acquireSlot("interactive");
  order.push("ia");
  assert.equal(queueState().active, 2);
  // release the interactive slot: bg2 still can't run (bg1 holds the background allowance)
  ia();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(bg2Granted, false);
  // release bg1: now bg2 runs
  bg1();
  const rel2 = await bg2;
  assert.deepEqual(order, ["bg1", "ia", "bg2"]);
  rel2();
  assert.equal(queueState().active, 0);
});

test("interactive waiters are served before earlier background waiters", async () => {
  const a = await acquireSlot("interactive");
  const b = await acquireSlot("interactive"); // both slots busy
  const seq: string[] = [];
  const bgWait = acquireSlot("background").then((r) => (seq.push("bg"), r));
  const iaWait = acquireSlot("interactive").then((r) => (seq.push("ia"), r));
  a(); // one slot frees → interactive first, even though background queued earlier
  const relIa = await iaWait;
  assert.deepEqual(seq, ["ia"]);
  b();
  relIa();
  const relBg = await bgWait;
  assert.deepEqual(seq, ["ia", "bg"]);
  relBg();
});
