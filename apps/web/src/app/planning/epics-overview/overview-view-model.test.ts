import assert from "node:assert/strict";
import test from "node:test";

import {
  applyClientEpicOverviewFilters,
  applyStoryPreviewFilters,
  buildEpicOverviewStats,
  getEpicOverviewStoriesPreview,
  getEpicOverviewStoriesPreviewOverflow,
  toPercentLabel,
  toStoriesLabel,
  toStoryPreviewAssignee,
  toStoryPreviewTitle,
  toStoryPreviewUpdatedAt,
} from "./overview-view-model.js";
import type {
  EpicOverviewFilters,
  EpicOverviewItem,
  EpicOverviewStoryPreview,
  EpicOverviewStoryPreviewFilters,
} from "./overview-types.js";

const ITEMS: EpicOverviewItem[] = [
  {
    work_item_id: "id-380",
    work_item_key: "MC-380",
    title: "Epic Overview 2.0",
    status: "IN_PROGRESS",
    progress_pct: 72.4,
    progress_trend_7d: 10,
    children_total: 10,
    children_done: 7,
    children_in_progress: 2,
    blocked_count: 1,
    stale_days: 2,
  },
  {
    work_item_id: "id-390",
    work_item_key: "MC-390",
    title: "CLI Stabilization",
    status: "TODO",
    progress_pct: 10,
    progress_trend_7d: 0,
    children_total: 8,
    children_done: 1,
    children_in_progress: 1,
    blocked_count: 0,
    stale_days: 9,
  },
  {
    work_item_id: "id-399",
    work_item_key: "MC-399",
    title: "Web Polish",
    status: "DONE",
    progress_pct: 100,
    progress_trend_7d: 20,
    children_total: 5,
    children_done: 5,
    children_in_progress: 0,
    blocked_count: 0,
    stale_days: 0,
  },
];

function filters(overrides: Partial<EpicOverviewFilters> = {}): EpicOverviewFilters {
  return {
    search: "",
    status: "",
    ownerId: "",
    label: "",
    blocked: "",
    sort: "-updated_at",
    ...overrides,
  };
}

function previewFilters(
  overrides: Partial<EpicOverviewStoryPreviewFilters> = {},
): EpicOverviewStoryPreviewFilters {
  return {
    status: "",
    blocked: "",
    ...overrides,
  };
}

test("buildEpicOverviewStats computes aggregated values", () => {
  const stats = buildEpicOverviewStats(ITEMS);

  assert.equal(stats.epicCount, 3);
  assert.equal(stats.blockedEpics, 1);
  assert.equal(stats.blockedStories, 1);
  assert.equal(stats.averageTrend7dPct, 10);
  assert.equal(stats.maxStaleDays, 9);
  assert.equal(stats.staleEpics, 1);
  assert.equal(stats.averageProgressPct, 60.8);
});

test("applyClientEpicOverviewFilters matches search, status and blocked", () => {
  const result = applyClientEpicOverviewFilters(
    ITEMS,
    filters({
      search: "overview",
      status: "IN_PROGRESS",
      blocked: "true",
    }),
    "all",
  );

  assert.deepEqual(result.map((item) => item.work_item_key), ["MC-380"]);
});

test("near-done preset keeps only high-progress unblocked epics", () => {
  const result = applyClientEpicOverviewFilters(ITEMS, filters(), "near-done");
  assert.deepEqual(result.map((item) => item.work_item_key), ["MC-399"]);
});

test("story preview helpers format title/assignee/updated_at", () => {
  const story: EpicOverviewStoryPreview = {
    work_item_id: "s-1",
    work_item_key: "MC-401",
    title: "Inline preview",
    status: "TODO",
    current_assignee_agent_id: "a-1",
    assignee_label: "Naomi N",
    is_blocked: false,
    updated_at: "2026-03-07T10:30:00Z",
  };

  assert.equal(toStoryPreviewTitle(story), "MC-401 Inline preview");
  assert.equal(toStoryPreviewAssignee(story), "Naomi N");
  assert.equal(toStoryPreviewUpdatedAt(story), "07 Mar 2026, 10:30");
});

test("story preview helpers use fallbacks for missing data", () => {
  const story: EpicOverviewStoryPreview = {
    work_item_id: "s-2",
    work_item_key: null,
    title: "No key",
    status: "TODO",
    current_assignee_agent_id: null,
    assignee_label: null,
    is_blocked: false,
    updated_at: null,
  };

  assert.equal(toStoryPreviewTitle(story), "No key");
  assert.equal(toStoryPreviewAssignee(story), "Unassigned");
  assert.equal(toStoryPreviewUpdatedAt(story), "n/a");
});

test("applyStoryPreviewFilters filters by status and blocked", () => {
  const stories: EpicOverviewStoryPreview[] = [
    {
      work_item_id: "s-1",
      work_item_key: "MC-401",
      title: "One",
      status: "TODO",
      current_assignee_agent_id: null,
      assignee_label: null,
      is_blocked: false,
      updated_at: "2026-03-07T10:30:00Z",
    },
    {
      work_item_id: "s-2",
      work_item_key: "MC-402",
      title: "Two",
      status: "IN_PROGRESS",
      current_assignee_agent_id: null,
      assignee_label: null,
      is_blocked: true,
      updated_at: "2026-03-07T10:30:00Z",
    },
  ];

  const byStatus = applyStoryPreviewFilters(stories, previewFilters({ status: "TODO" }));
  assert.deepEqual(byStatus.map((story) => story.work_item_id), ["s-1"]);

  const byBlocked = applyStoryPreviewFilters(stories, previewFilters({ blocked: "true" }));
  assert.deepEqual(byBlocked.map((story) => story.work_item_id), ["s-2"]);
});

test("preview helpers return limited rows and overflow count", () => {
  const item: EpicOverviewItem = {
    ...ITEMS[0],
    stories_preview_total: 5,
    stories_preview: [
      {
        work_item_id: "s-1",
        work_item_key: "MC-401",
        title: "One",
        status: "TODO",
        current_assignee_agent_id: null,
        assignee_label: null,
        is_blocked: false,
        updated_at: "2026-03-07T10:30:00Z",
      },
      {
        work_item_id: "s-2",
        work_item_key: "MC-402",
        title: "Two",
        status: "TODO",
        current_assignee_agent_id: null,
        assignee_label: null,
        is_blocked: false,
        updated_at: "2026-03-07T10:30:00Z",
      },
      {
        work_item_id: "s-3",
        work_item_key: "MC-403",
        title: "Three",
        status: "TODO",
        current_assignee_agent_id: null,
        assignee_label: null,
        is_blocked: false,
        updated_at: "2026-03-07T10:30:00Z",
      },
      {
        work_item_id: "s-4",
        work_item_key: "MC-404",
        title: "Four",
        status: "TODO",
        current_assignee_agent_id: null,
        assignee_label: null,
        is_blocked: false,
        updated_at: "2026-03-07T10:30:00Z",
      },
    ],
  };

  const preview = getEpicOverviewStoriesPreview(item);
  assert.equal(preview.length, 3);
  assert.equal(getEpicOverviewStoriesPreviewOverflow(item), 2);
});

test("format helpers produce deterministic labels", () => {
  assert.equal(toPercentLabel(72.4), "72%");
  assert.equal(toStoriesLabel(ITEMS[0]), "7/10 done · 2 in progress");
});
