import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StoryTypeBadge, resolveStoryTypeVisualConfig } from "./story-type-badge.js";

test("resolveStoryTypeVisualConfig falls back to USER_STORY when type is unknown", () => {
  const known = resolveStoryTypeVisualConfig("BUG");
  const unknown = resolveStoryTypeVisualConfig("UNKNOWN");

  assert.equal(known.label, "Bug");
  assert.equal(unknown.label, "User Story");
});

test("StoryTypeBadge renders icon + label for badge and plain variants", () => {
  const badgeMarkup = renderToStaticMarkup(
    React.createElement(StoryTypeBadge, {
      storyType: "USER_STORY",
      variant: "badge",
    }),
  );
  const plainMarkup = renderToStaticMarkup(
    React.createElement(StoryTypeBadge, {
      storyType: "TASK",
      variant: "plain",
    }),
  );

  assert.match(badgeMarkup, /User Story/);
  assert.match(badgeMarkup, /rounded-full border/);
  assert.match(plainMarkup, /Task/);
  assert.match(plainMarkup, /text-\[11px\]/);
});
