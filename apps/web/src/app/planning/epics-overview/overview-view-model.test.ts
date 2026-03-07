import assert from "node:assert/strict";
import test from "node:test";

import {
  applyClientEpicOverviewFilters,
  buildEpicOverviewStats,
  toPercentLabel,
  toStoriesLabel,
} from "./overview-view-model.js";
import type { EpicOverviewFilters, EpicOverviewItem } from "./overview-types.js";

const ITEMS: EpicOverviewItem[] = [
  {
    epic_key: "MC-380",
    title: "Epic Overview 2.0",
    status: "IN_PROGRESS",
    progress_pct: 72.4,
    stories_total: 10,
    stories_done: 7,
    stories_in_progress: 2,
    blocked_count: 1,
    stale_days: 2,
  },
  {
    epic_key: "MC-390",
    title: "CLI Stabilization",
    status: "TODO",
    progress_pct: 10,
    stories_total: 8,
    stories_done: 1,
    stories_in_progress: 1,
    blocked_count: 0,
    stale_days: 9,
  },
  {
    epic_key: "MC-399",
    title: "Web Polish",
    status: "DONE",
    progress_pct: 100,
    stories_total: 5,
    stories_done: 5,
    stories_in_progress: 0,
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

test("buildEpicOverviewStats computes aggregated values", () => {
  const stats = buildEpicOverviewStats(ITEMS);

  assert.equal(stats.epicCount, 3);
  assert.equal(stats.blockedEpics, 1);
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

  assert.deepEqual(result.map((item) => item.epic_key), ["MC-380"]);
});

test("near-done preset keeps only high-progress unblocked epics", () => {
  const result = applyClientEpicOverviewFilters(ITEMS, filters(), "near-done");
  assert.deepEqual(result.map((item) => item.epic_key), ["MC-399"]);
});

test("format helpers produce deterministic labels", () => {
  assert.equal(toPercentLabel(72.4), "72%");
  assert.equal(toStoriesLabel(ITEMS[0]), "7/10 done · 2 in progress");
});
