import assert from "node:assert/strict";
import test from "node:test";

import { BACKLOG_ROW_LAYOUT } from "./backlog-row.js";
import { STORY_CARD_LAYOUT } from "./story-card.js";

test("story card footer keeps metadata and action rows split", () => {
  assert.equal(STORY_CARD_LAYOUT.footer, "flex flex-col gap-1.5");
  assert.equal(STORY_CARD_LAYOUT.metadataRow, "flex items-center justify-between gap-2");
  assert.equal(STORY_CARD_LAYOUT.actionRow, "flex items-center justify-end gap-1.5");
});

test("story card action controls and task progress use stable sizing", () => {
  assert.equal(STORY_CARD_LAYOUT.statusSelect, "h-6 w-[108px]");
  assert.equal(STORY_CARD_LAYOUT.removeButton, "h-6 min-w-[72px]");
  assert.equal(STORY_CARD_LAYOUT.taskProgress, "min-h-4 min-w-[44px] text-right");
});

test("backlog row uses fixed-width grid columns for alignment", () => {
  assert.equal(
    BACKLOG_ROW_LAYOUT.gridTemplate,
    "grid-cols-[auto_72px_minmax(0,1fr)_112px_240px_112px_36px_56px]",
  );
  assert.equal(BACKLOG_ROW_LAYOUT.actions, "w-[112px]");
  assert.equal(BACKLOG_ROW_LAYOUT.epic, "w-[240px]");
  assert.equal(BACKLOG_ROW_LAYOUT.status, "w-[112px]");
  assert.equal(BACKLOG_ROW_LAYOUT.storyPoints, "w-[36px]");
  assert.equal(BACKLOG_ROW_LAYOUT.taskProgress, "w-[56px]");
});
