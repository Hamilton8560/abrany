import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import {
  enrollLesson,
  autoEnrollLesson,
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

test("enrolledLessons returns the rotation for a user", () => {
  const { lesson, userId } = seedReadyLesson();
  enrollLesson(lesson.id);
  const rot = enrolledLessons(userId);
  assert.equal(rot.length, 1);
  assert.equal(rot[0].id, lesson.id);
  assert.equal(typeof rot[0].goal_title, "string");
});
