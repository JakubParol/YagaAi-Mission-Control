import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOptimisticStoryStatus,
  rollbackStoryStatus,
  type ActiveSprintDataLike,
} from "./status-updates.js";

type StoryFixture = {
  id: string;
  status: "TODO" | "IN_PROGRESS" | "CODE_REVIEW" | "VERIFY" | "DONE";
  title: string;
};

function makeData(storyStatus: StoryFixture["status"]): ActiveSprintDataLike<StoryFixture> {
  return {
    backlog: { id: "b1" },
    stories: [
      { id: "s1", status: storyStatus, title: "Primary story" },
      { id: "s2", status: "TODO", title: "Secondary story" },
    ],
  };
}

test("applyOptimisticStoryStatus updates matching story and returns previous status", () => {
  const data = makeData("TODO");
  const result = applyOptimisticStoryStatus(data, "s1", "IN_PROGRESS");

  assert.equal(result.previousStatus, "TODO");
  assert.equal(result.data.stories[0].status, "IN_PROGRESS");
  assert.equal(result.data.stories[1].status, "TODO");
});

test("applyOptimisticStoryStatus is a no-op when status is unchanged", () => {
  const data = makeData("VERIFY");
  const result = applyOptimisticStoryStatus(data, "s1", "VERIFY");

  assert.equal(result.previousStatus, null);
  assert.equal(result.data, data);
});

test("rollbackStoryStatus restores the prior status", () => {
  const optimistic = makeData("CODE_REVIEW");
  const rolledBack = rollbackStoryStatus(optimistic, "s1", "TODO");

  assert.equal(rolledBack.stories[0].status, "TODO");
  assert.equal(rolledBack.stories[1].status, "TODO");
});
