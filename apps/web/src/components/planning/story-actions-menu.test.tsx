import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StoryActionsMenu } from "./story-actions-menu.js";

test("StoryActionsMenu renders trigger with story-specific aria label", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-1",
      storyKey: "MC-277",
      storyTitle: "Delete story from board and list",
      onDelete: () => undefined,
    }),
  );

  assert.match(markup, /Open story actions for MC-277 Delete story from board and list/);
  assert.match(markup, /button/);
});

test("StoryActionsMenu renders Delete option when opened", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-2",
      storyKey: null,
      storyTitle: "Untitled story",
      onDelete: () => undefined,
      defaultOpen: true,
    }),
  );

  assert.match(markup, /Story actions for Untitled story/);
  assert.match(markup, />Delete</);
});
