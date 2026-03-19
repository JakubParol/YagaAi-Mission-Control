import assert from "node:assert/strict";
import test from "node:test";

import {
  getStoryDetailDeleteRedirectHref,
  getStoryDetailShellState,
  getWorkItemPageHref,
} from "./story-detail-shell.ts";

test("getWorkItemPageHref points modal detail to the canonical work-item page route", () => {
  assert.equal(getWorkItemPageHref("work-item-123"), "/planning/work-items/work-item-123");
  assert.equal(getWorkItemPageHref(null), null);
});

test("getStoryDetailDeleteRedirectHref keeps embedded detail delete flow on the planning list", () => {
  assert.equal(getStoryDetailDeleteRedirectHref(), "/planning/list");
});

test("getStoryDetailShellState keeps modal detail active off open state and exposes full-page action", () => {
  assert.deepEqual(
    getStoryDetailShellState({ storyId: "work-item-1", open: true }),
    {
      isActive: true,
      fullPageHref: "/planning/work-items/work-item-1",
      deleteRedirectHref: "/planning/list",
    },
  );
});

test("getStoryDetailShellState keeps embedded detail active from the selected work item and hides the full-page link", () => {
  assert.deepEqual(
    getStoryDetailShellState({ embedded: true, storyId: "work-item-2", open: false }),
    {
      isActive: true,
      fullPageHref: null,
      deleteRedirectHref: "/planning/list",
    },
  );
});

test("getStoryDetailShellState keeps embedded detail inactive when no work item is selected", () => {
  assert.deepEqual(
    getStoryDetailShellState({ embedded: true, storyId: null, open: true }),
    {
      isActive: false,
      fullPageHref: null,
      deleteRedirectHref: "/planning/list",
    },
  );
});
