import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowStoryDetailActions } from "./story-detail-dialog.js";

test("shouldShowStoryDetailActions allows USER_STORY/TASK/BUG and blocks unsupported types", () => {
  assert.equal(shouldShowStoryDetailActions("USER_STORY"), true);
  assert.equal(shouldShowStoryDetailActions("TASK"), true);
  assert.equal(shouldShowStoryDetailActions("BUG"), true);
  assert.equal(shouldShowStoryDetailActions("CHORE"), false);
  assert.equal(shouldShowStoryDetailActions(null), false);
});
