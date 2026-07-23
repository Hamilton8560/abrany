import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import {
  autoEnrollLesson,
  enrollLesson,
  unenrollLesson,
  getLesson,
  setLessonStatus,
} from "../lib/repo.ts";

test("autoEnroll schedules a ready lesson for tomorrow", () => {
  const { lesson } = seedReadyLesson();
  const res = autoEnrollLesson(lesson.id);
  assert.equal(res.enrolled, true);
  const row = getLesson(lesson.id)!;
  assert.notEqual(row.srs_due, null);
  assert.equal(row.srs_due! > new Date().toISOString().slice(0, 10), true); // strictly after today
  assert.equal(row.srs_interval, 1);
  assert.equal(row.srs_reps, 0);
});

test("autoEnroll skips a lesson without ready content", () => {
  const { lesson } = seedReadyLesson({ ready: false });
  setLessonStatus(lesson.id, "stub");
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false);
  assert.equal(getLesson(lesson.id)!.srs_due, null);
});

test("autoEnroll respects a prior opt-out", () => {
  const { lesson } = seedReadyLesson();
  unenrollLesson(lesson.id); // user removed it: sets optout
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false);
  assert.equal(getLesson(lesson.id)!.srs_due, null);
});

test("autoEnroll is idempotent once enrolled", () => {
  const { lesson } = seedReadyLesson();
  autoEnrollLesson(lesson.id);
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false); // already enrolled
});

test("manual enroll clears opt-out and is due today", () => {
  const { lesson } = seedReadyLesson();
  unenrollLesson(lesson.id);
  enrollLesson(lesson.id);
  const row = getLesson(lesson.id)!;
  assert.equal(row.srs_optout, 0);
  assert.equal(row.srs_due, new Date().toISOString().slice(0, 10)); // date('now')
});

test("completing then autoEnrolling a ready lesson enrolls exactly once", () => {
  const { lesson } = seedReadyLesson();
  assert.equal(autoEnrollLesson(lesson.id).enrolled, true); // first completion
  assert.equal(autoEnrollLesson(lesson.id).enrolled, false); // unchecking + re-checking won't re-add
});
