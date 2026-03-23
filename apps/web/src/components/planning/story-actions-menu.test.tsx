import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  calculateMainMenuCoordinates,
  calculateSubmenuCoordinates,
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
  assert.match(markup, />Copy key</);
  assert.match(markup, />Add label</);
  assert.match(markup, />Change status</);
  assert.match(markup, />Add flag</);
  assert.match(markup, />Link work item</);
  assert.match(markup, />Move to epic</);
  assert.match(markup, />Archive</);
  assert.match(markup, />Delete</);
});

test("StoryActionsMenu keeps floating menu hidden until coordinates are measured", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-5",
      storyType: "USER_STORY",
      storyKey: "MC-334",
      storyTitle: "Story action menu flicker",
      onDelete: () => undefined,
      defaultOpen: true,
    }),
  );

  assert.match(markup, /visibility:hidden/);
  assert.match(markup, /Story actions for MC-334 Story action menu flicker/);
});

test("StoryActionsMenu does not use transform-based enter animation on the floating menu", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-6",
      storyType: "USER_STORY",
      storyKey: "MC-339",
      storyTitle: "Menu animation",
      onDelete: () => undefined,
      defaultOpen: true,
    }),
  );

  assert.doesNotMatch(markup, /animate-in/);
  assert.doesNotMatch(markup, /zoom-in-95/);
});

test("StoryActionsMenu keeps status submenu hidden until coordinates are measured", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryActionsMenu, {
      storyId: "s-7",
      storyType: "USER_STORY",
      storyKey: "MC-343",
      storyTitle: "Submenu shift",
      storyStatus: "TODO",
      onDelete: () => undefined,
      onStatusChange: () => undefined,
      defaultOpen: true,
      defaultStatusSubmenuOpen: true,
    }),
  );

  assert.match(markup, /Story status options/);
  assert.match(markup, /visibility:hidden/);
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

test("calculateMainMenuCoordinates flips upward when there is no room below", () => {
  const coordinates = calculateMainMenuCoordinates(
    { top: 680, left: 740, right: 772, bottom: 712 },
    { width: 192, height: 320 },
    { width: 1280, height: 720 },
  );

  assert.equal(coordinates.left, 580);
  assert.equal(coordinates.top, 356);
});

test("calculateMainMenuCoordinates clamps inside viewport on narrow screens", () => {
  const coordinates = calculateMainMenuCoordinates(
    { top: 32, left: 340, right: 372, bottom: 64 },
    { width: 192, height: 320 },
    { width: 360, height: 640 },
  );

  assert.equal(coordinates.left, 160);
  assert.equal(coordinates.top, 68);
});

test("calculateSubmenuCoordinates opens left when right side would overflow", () => {
  const coordinates = calculateSubmenuCoordinates(
    { top: 440, left: 1060, right: 1210, bottom: 470 },
    { top: 360, left: 1020, right: 1212, bottom: 700 },
    { width: 176, height: 220 },
    { width: 1280, height: 720 },
  );

  assert.equal(coordinates.left, 840);
  assert.equal(coordinates.top, 440);
});

test("calculateSubmenuCoordinates clamps top inside viewport", () => {
  const coordinates = calculateSubmenuCoordinates(
    { top: 620, left: 200, right: 360, bottom: 650 },
    { top: 560, left: 180, right: 372, bottom: 700 },
    { width: 176, height: 220 },
    { width: 1280, height: 720 },
  );

  assert.equal(coordinates.left, 376);
  assert.equal(coordinates.top, 492);
});
