import assert from "node:assert/strict";
import test from "node:test";

import { TODO_QUICK_CREATE_LAYOUT } from "./sprint-board.js";

test("todo quick-create layout keeps controls compact and actions right-aligned", () => {
  assert.equal(TODO_QUICK_CREATE_LAYOUT.controlsRow, "flex min-w-0 items-center gap-2");
  assert.equal(TODO_QUICK_CREATE_LAYOUT.actionsRow, "flex w-full items-center justify-end gap-1");
});
