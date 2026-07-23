import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import { getLesson } from "../lib/repo.ts";

test("fixture seeds a ready lesson", () => {
  const { lesson } = seedReadyLesson();
  const row = getLesson(lesson.id);
  assert.equal(row?.status, "ready");
  assert.equal(row?.srs_due, null); // not enrolled yet
});
