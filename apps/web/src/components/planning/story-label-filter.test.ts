import assert from "node:assert/strict";
import test from "node:test";

import {
  extractStoryLabelIds,
  filterStoriesBySelectedLabels,
  matchesSelectedStoryLabels,
} from "./story-label-filter.js";

test("extractStoryLabelIds prefers label_ids when present", () => {
  const labelIds = extractStoryLabelIds({
    label_ids: ["l-1", "l-2"],
    labels: [{ id: "fallback" }],
  });

  assert.deepEqual(labelIds, ["l-1", "l-2"]);
});

test("matchesSelectedStoryLabels returns true when at least one selected label matches", () => {
  const story = { label_ids: ["planning", "ui"] };

  assert.equal(matchesSelectedStoryLabels(story, ["backend", "ui"]), true);
  assert.equal(matchesSelectedStoryLabels(story, ["backend"]), false);
});

test("filterStoriesBySelectedLabels keeps all stories when no labels are selected", () => {
  const stories = [{ id: "s1", label_ids: ["a"] }, { id: "s2", label_ids: ["b"] }];

  const filtered = filterStoriesBySelectedLabels(stories, []);

  assert.deepEqual(filtered, stories);
  assert.notEqual(filtered, stories);
});

test("filterStoriesBySelectedLabels removes stories without any selected labels", () => {
  const stories = [
    { id: "s1", label_ids: ["planning"] },
    { id: "s2", labels: [{ id: "ui" }] },
    { id: "s3", label_ids: [] },
  ];

  const filtered = filterStoriesBySelectedLabels(stories, ["ui"]);

  assert.deepEqual(
    filtered.map((story) => story.id),
    ["s2"],
  );
});
