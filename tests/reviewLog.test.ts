import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import { logReview, recentRecall } from "../lib/repo.ts";

test("logReview persists and recentRecall returns newest first", () => {
  const { lesson, userId } = seedReadyLesson();
  logReview({ lessonId: lesson.id, userId, recallText: "first try", rating: "hard", verdict: "partial" });
  logReview({ lessonId: lesson.id, userId, recallText: "second try", rating: "good", verdict: "correct" });
  const log = recentRecall(lesson.id);
  assert.equal(log.length, 2);
  assert.equal(log[0].recall_text, "second try");
  assert.equal(log[0].rating, "good");
  assert.equal(log[1].recall_text, "first try");
});

test("verdict defaults to empty string when omitted", () => {
  const { lesson, userId } = seedReadyLesson();
  logReview({ lessonId: lesson.id, userId, recallText: "no ai grade", rating: "easy" });
  assert.equal(recentRecall(lesson.id)[0].verdict, "");
});
