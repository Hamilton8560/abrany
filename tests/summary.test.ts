import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import {
  enrollLesson,
  autoEnrollLesson,
  saveReview,
  srsSummary,
  upcomingReviews,
  enrolledLessons,
} from "../lib/repo.ts";

test("srsSummary counts enrolled / dueToday / learning", () => {
  const a = seedReadyLesson();
  const b = seedReadyLesson({}); // same-user isolation not required; separate users are fine
  enrollLesson(a.lesson.id); // due today, reps 0 -> learning
  autoEnrollLesson(b.lesson.id); // due tomorrow
  // NOTE: seedReadyLesson makes a new user each call; assert per-user.
  const s = srsSummary(a.userId);
  assert.equal(s.enrolled, 1);
  assert.equal(s.dueToday, 1);
  assert.equal(s.learning, 1);
});

test("upcomingReviews lists future-due lessons only", () => {
  const { lesson, userId } = seedReadyLesson();
  autoEnrollLesson(lesson.id); // tomorrow
  const up = upcomingReviews(userId);
  assert.equal(up.length, 1);
  assert.equal(up[0].id, lesson.id);
});

test("upcomingReviews excludes lessons due today", () => {
  const { lesson, userId } = seedReadyLesson();
  enrollLesson(lesson.id); // due TODAY (manual) — belongs in the queue, not "coming up"
  assert.equal(srsSummary(userId).dueToday, 1); // it IS due
  assert.deepEqual(upcomingReviews(userId), []); // but NOT in the upcoming preview
});

test("srsSummary counts a lesson as mastered at the interval boundary", () => {
  const { lesson, userId } = seedReadyLesson();
  enrollLesson(lesson.id);
  saveReview(lesson.id, { interval: 21, ease: 2.5, reps: 5 }); // long interval, well-drilled
  const s = srsSummary(userId);
  assert.equal(s.enrolled, 1);
  assert.equal(s.mastered, 1); // srs_interval >= 21
  assert.equal(s.learning, 0); // srs_reps >= 2, no longer "learning"
});

test("enrolledLessons returns the rotation for a user", () => {
  const { lesson, userId } = seedReadyLesson();
  enrollLesson(lesson.id);
  const rot = enrolledLessons(userId);
  assert.equal(rot.length, 1);
  assert.equal(rot[0].id, lesson.id);
  assert.equal(typeof rot[0].goal_title, "string");
});
