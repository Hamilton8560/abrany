import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUser, createSession } from "../lib/repo.ts";
import { createOrg, listSessionDays } from "../lib/org.ts";
import { parseDateRange, sessionDaysJson } from "../lib/orgApi.ts";
import { getDb } from "../lib/db.ts";

let counter = 0;

/** Seed an org owned by a fresh user; optionally add a second member. */
function seedOrg({ members = 1 }: { members?: number } = {}) {
  const i = ++counter;
  const owner = createUser(`owner${i}@example.com`, "hash");
  const org = createOrg(owner.id, `Org ${i}`);
  const users = [owner];
  for (let m = 1; m < members; m++) {
    const u = createUser(`member${i}-${m}@example.com`, "hash");
    getDb()
      .prepare("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'member')")
      .run(org.id, u.id);
    users.push(u);
  }
  return { org, users };
}

const focus = (userId: number, durationSec: number, startedAt: string) =>
  createSession({ userId, durationSec, startedAt, endedAt: startedAt });

test("buckets sessions per member per calendar day across the range", () => {
  const { org, users } = seedOrg();
  const [u] = users;
  focus(u.id, 1500, "2026-08-01 09:00:00");
  focus(u.id, 1800, "2026-08-01 14:00:00");
  focus(u.id, 1500, "2026-08-03 09:00:00");

  const rows = sessionDaysJson(org, "2026-08-01", "2026-08-04");
  assert.deepEqual(rows, [
    { email: u.email, date: "2026-08-01", pomodoros: 2, focusSec: 3300 },
    { email: u.email, date: "2026-08-03", pomodoros: 1, focusSec: 1500 },
  ]);
});

test("25-minute threshold counts at exactly 1500s but not 1499s", () => {
  const { org, users } = seedOrg();
  const [u] = users;
  focus(u.id, 1499, "2026-08-01 09:00:00");
  focus(u.id, 1500, "2026-08-01 10:00:00");

  const [day] = sessionDaysJson(org, "2026-08-01", "2026-08-01");
  assert.equal(day.pomodoros, 1);
  assert.equal(day.focusSec, 2999); // short sessions still add to focus time
});

test("ad-hoc pomodoros with no goal are counted", () => {
  const { org, users } = seedOrg();
  const [u] = users;
  const s = createSession({
    userId: u.id,
    goalId: null, // the whole point: no assignment/goal attached
    durationSec: 1500,
    startedAt: "2026-08-02 11:00:00",
    endedAt: "2026-08-02 11:25:00",
  });
  assert.equal(s.goal_id, null);

  const [day] = sessionDaysJson(org, "2026-08-02", "2026-08-02");
  assert.equal(day.pomodoros, 1);
  assert.equal(day.focusSec, 1500);
});

test("break sessions never count, in either aggregate", () => {
  const { org, users } = seedOrg();
  const [u] = users;
  createSession({ userId: u.id, mode: "break", durationSec: 1800, startedAt: "2026-08-01 09:00:00" });

  assert.deepEqual(sessionDaysJson(org, "2026-08-01", "2026-08-01"), []);
});

test("sessions outside the date range are excluded", () => {
  const { org, users } = seedOrg();
  const [u] = users;
  focus(u.id, 1500, "2026-07-31 23:59:59");
  focus(u.id, 1500, "2026-08-05 00:00:00");

  assert.deepEqual(sessionDaysJson(org, "2026-08-01", "2026-08-04"), []);
});

test("every member of the org appears under their own email", () => {
  const { org, users } = seedOrg({ members: 2 });
  focus(users[0].id, 1500, "2026-08-01 09:00:00");
  focus(users[1].id, 3000, "2026-08-01 09:00:00");

  const rows = sessionDaysJson(org, "2026-08-01", "2026-08-01");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.email).sort(),
    users.map((u) => u.email).sort(),
  );
});

test("one org's key never sees another org's data", () => {
  const a = seedOrg();
  const b = seedOrg();
  focus(a.users[0].id, 1500, "2026-08-01 09:00:00");
  focus(b.users[0].id, 1500, "2026-08-01 09:00:00");

  const rowsA = sessionDaysJson(a.org, "2026-08-01", "2026-08-01");
  assert.equal(rowsA.length, 1);
  assert.equal(rowsA[0].email, a.users[0].email);

  // raw query layer is scoped the same way
  const raw = listSessionDays(b.org.id, "2026-08-01", "2026-08-01");
  assert.equal(raw.length, 1);
  assert.equal(raw[0].email, b.users[0].email);
});

test("parseDateRange accepts a sane range", () => {
  assert.deepEqual(parseDateRange("https://x.test/api/v1/sessions?from=2026-08-01&to=2026-08-31"), {
    from: "2026-08-01",
    to: "2026-08-31",
  });
  // single day and the full 366-day cap are both fine
  assert.ok("from" in parseDateRange("https://x.test/?from=2026-08-01&to=2026-08-01"));
  assert.ok("from" in parseDateRange("https://x.test/?from=2026-01-01&to=2027-01-01"));
});

test("parseDateRange rejects bad input with a clear error", () => {
  const err = (url: string) => {
    const r = parseDateRange(url);
    assert.ok("error" in r, `expected an error for ${url}`);
    return r.error;
  };
  err("https://x.test/api/v1/sessions"); // missing both
  err("https://x.test/?from=2026-08-01"); // missing to
  err("https://x.test/?from=08-01-2026&to=2026-08-31"); // wrong format
  err("https://x.test/?from=2026-02-30&to=2026-08-31"); // not a real date
  err("https://x.test/?from=2026-08-31&to=2026-08-01"); // inverted
  err("https://x.test/?from=2026-01-01&to=2027-01-02"); // 367 days
});
