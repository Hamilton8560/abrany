import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUser, getUser } from "../lib/repo.ts";
import { createOrg, addMemberByEmail, listMembers, setMemberLanguage } from "../lib/org.ts";

test("an employee signed up in Spanish gets a Spanish account; admins can change it", async () => {
  const owner = createUser("owner-lang@example.com", "hash");
  const org = createOrg(owner.id, "American Iron");
  const r = await addMemberByEmail(org.id, "laura-lang@example.com", "member", "es");
  assert.equal(r.status, "created");
  const row = listMembers(org.id).find((m) => m.email === "laura-lang@example.com")!;
  assert.equal(row.language, "es");
  assert.equal(getUser(row.user_id)?.language, "es");

  assert.equal(setMemberLanguage(org.id, row.user_id, "en"), true);
  assert.equal(getUser(row.user_id)?.language, "en");
  assert.equal(setMemberLanguage(org.id, row.user_id, "xx"), false); // unsupported
  const outsider = createUser("outsider-lang@example.com", "hash");
  assert.equal(setMemberLanguage(org.id, outsider.id, "es"), false); // not in this org
  assert.equal(getUser(outsider.id)?.language || "en", "en");
});

test("no language given → English, as before", async () => {
  const owner = createUser("owner-lang2@example.com", "hash");
  const org = createOrg(owner.id, "Org Two");
  await addMemberByEmail(org.id, "lenin-lang@example.com");
  assert.equal(listMembers(org.id).find((m) => m.email === "lenin-lang@example.com")?.language, "en");
});

test("auto-created exams are titled in the learner's language, and follow a language switch", async () => {
  const { createGoal, createPlan, ensureExams, setUserLanguage, getExam } = await import("../lib/repo.ts");
  const u = createUser("gisela-exams@example.com", "hash");
  setUserLanguage(u.id, "es");
  const goal = createGoal(u.id, "Atención al cliente");
  createPlan(goal.id, "Plan", "", [1, 2, 3, 4].map((i) => ({ title: `Etapa ${i}` })));
  const exams = ensureExams(goal.id);
  assert.deepEqual(exams.map((e) => e.title), ["Examen parcial — Atención al cliente", "Examen final — Atención al cliente"]);
  assert.equal(getExam(exams[1].id)?.title, "Examen final — Atención al cliente");
  setUserLanguage(u.id, "en");
  assert.deepEqual(ensureExams(goal.id).map((e) => e.title), ["Midterm — Atención al cliente", "Final exam — Atención al cliente"]);
});
