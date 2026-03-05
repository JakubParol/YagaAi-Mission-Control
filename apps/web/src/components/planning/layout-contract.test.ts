import assert from "node:assert/strict";
import test from "node:test";

import { BACKLOG_ROW_LAYOUT } from "./backlog-row.js";
import { STORY_CARD_LAYOUT } from "./story-card.js";
import { STORY_DETAIL_HEADER_LAYOUT } from "./story-detail-dialog.js";

test("story card keeps a single metadata row layout", () => {
  assert.equal(STORY_CARD_LAYOUT.metadataRow, "flex items-center justify-between gap-2 mb-0.5");
  assert.equal(STORY_CARD_LAYOUT.metadataLeft, "flex min-w-0 items-center gap-1.5");
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

test("story detail header keeps a dedicated top-right actions group", () => {
  assert.equal(STORY_DETAIL_HEADER_LAYOUT.actionsGroup, "ml-auto flex items-center gap-1.5");
});
