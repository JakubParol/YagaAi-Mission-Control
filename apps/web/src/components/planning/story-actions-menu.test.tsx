import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  isStoryActionsSupportedType,
  reduceDeleteConfirmPhase,
  StoryActionsMenu,
} from "./story-actions-menu.js";

test("StoryActionsMenu renders trigger with story-specific aria label", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-1",
      storyType: "USER_STORY",
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
      storyType: "BUG",
      storyKey: null,
      storyTitle: "Untitled story",
      onDelete: () => undefined,
      defaultOpen: true,
    }),
  );

  assert.match(markup, /Story actions for Untitled story/);
  assert.match(markup, />Delete</);
});

test("StoryActionsMenu accepts confirm-open state without breaking markup", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-3",
      storyType: "TASK",
      storyKey: "MC-281",
      storyTitle: "Themed delete dialog",
      onDelete: () => undefined,
      defaultConfirmOpen: true,
    }),
  );

  assert.match(markup, /Open story actions for MC-281 Themed delete dialog/);
});

test("isStoryActionsSupportedType allows USER_STORY, TASK, BUG and blocks others", () => {
  assert.equal(isStoryActionsSupportedType("USER_STORY"), true);
  assert.equal(isStoryActionsSupportedType("TASK"), true);
  assert.equal(isStoryActionsSupportedType("BUG"), true);
  assert.equal(isStoryActionsSupportedType("feature"), false);
  assert.equal(isStoryActionsSupportedType(null), false);
});

test("reduceDeleteConfirmPhase covers open, cancel, confirm, and finish flow", () => {
  let phase = reduceDeleteConfirmPhase("closed", "OPEN");
  assert.equal(phase, "open");

  phase = reduceDeleteConfirmPhase(phase, "CANCEL");
  assert.equal(phase, "closed");

  phase = reduceDeleteConfirmPhase(phase, "OPEN");
  assert.equal(phase, "open");

  phase = reduceDeleteConfirmPhase(phase, "CONFIRM");
  assert.equal(phase, "submitting");

  phase = reduceDeleteConfirmPhase(phase, "CANCEL");
  assert.equal(phase, "submitting");

  phase = reduceDeleteConfirmPhase(phase, "FINISH");
  assert.equal(phase, "closed");
});

test("StoryActionsMenu hides trigger for unsupported story type", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-4",
      storyType: "FEATURE",
      storyKey: "MC-999",
      storyTitle: "Unsupported",
      onDelete: () => undefined,
    }),
  );

  assert.equal(markup, "");
});
