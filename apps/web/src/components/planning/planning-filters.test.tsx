import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyPlanningFilters,
  applyPlanningStoryFilters,
  buildStoryEpicOptions,
  buildStoryLabelOptions,
  buildStoryStatusOptions,
  buildStoryTypeOptions,
  hasActivePlanningFilters,
  PlanningFilters,
  UNASSIGNED_FILTER_VALUE,
  type PlanningFiltersValue,
} from "./planning-filters.js";

const STORIES = [
  {
    id: "s1",
    key: "MC-1",
    title: "Unify planning filters",
    status: "TODO",
    type: "STORY",
    sub_type: "USER_STORY",
    labels: [{ id: "l-web", name: "WEB" }],
    parent_id: "e-1",
    parent_key: "MC-44",
    parent_title: "Web Early Access",
    current_assignee_agent_id: "a-1",
  },
  {
    id: "s2",
    key: "MC-2",
    title: "Fix board bug",
    status: "IN_PROGRESS",
    type: "STORY",
    sub_type: "BUG",
    labels: [{ id: "l-api", name: "API" }],
    parent_id: "e-2",
    parent_key: "MC-50",
    parent_title: "API hardening",
    current_assignee_agent_id: null,
  },
] as const;

function emptyFilters(overrides: Partial<PlanningFiltersValue> = {}): PlanningFiltersValue {
  return {
    search: "",
    status: "",
    type: "",
    labelId: "",
    epicId: "",
    assignee: "",
    ...overrides,
  };
}

test("hasActivePlanningFilters detects non-empty filter state", () => {
  assert.equal(hasActivePlanningFilters(emptyFilters()), false);
  assert.equal(hasActivePlanningFilters(emptyFilters({ search: "mc" })), true);
});

test("applyPlanningStoryFilters composes all criteria with AND semantics", () => {
  const filtered = applyPlanningStoryFilters(
    STORIES,
    emptyFilters({
      search: "unify",
      status: "TODO",
      type: "USER_STORY",
      labelId: "l-web",
      epicId: "e-1",
      assignee: "a-1",
    }),
  );

  assert.deepEqual(filtered.map((story) => story.id), ["s1"]);
});

test("applyPlanningStoryFilters supports unassigned assignee", () => {
  const filtered = applyPlanningStoryFilters(
    STORIES,
    emptyFilters({ assignee: UNASSIGNED_FILTER_VALUE }),
  );

  assert.deepEqual(filtered.map((story) => story.id), ["s2"]);
});

test("applyPlanningFilters supports shared engine via custom adapter", () => {
  const items = [
    {
      id: "x-1",
      key: "MC-10",
      title: "Filter list rows",
      status: "TODO",
      type: "USER_STORY",
      labelIds: ["l-web"],
      epicId: "e-1",
      assigneeId: "a-1",
    },
    {
      id: "x-2",
      key: "MC-11",
      title: "Refactor board filters",
      status: "DONE",
      type: "TASK",
      labelIds: [],
      epicId: null,
      assigneeId: null,
    },
  ] as const;

  const filtered = applyPlanningFilters(
    items,
    emptyFilters({ status: "TODO", type: "USER_STORY", labelId: "l-web" }),
    (item) => item,
  );

  assert.deepEqual(filtered.map((item) => item.id), ["x-1"]);
});

test("story option builders emit unique sorted values", () => {
  assert.deepEqual(buildStoryStatusOptions(STORIES), [
    { value: "IN_PROGRESS", label: "IN PROGRESS" },
    { value: "TODO", label: "TODO" },
  ]);

  assert.deepEqual(buildStoryTypeOptions(STORIES), [
    { value: "BUG", label: "BUG" },
    { value: "USER_STORY", label: "USER STORY" },
  ]);

  assert.deepEqual(buildStoryLabelOptions(STORIES), [
    { value: "l-api", label: "API" },
    { value: "l-web", label: "WEB" },
  ]);

  assert.deepEqual(buildStoryEpicOptions(STORIES), [
    { value: "e-1", label: "MC-44 Web Early Access" },
    { value: "e-2", label: "MC-50 API hardening" },
  ]);
});

test("PlanningFilters renders all controls and clear action", () => {
  const html = renderToStaticMarkup(
    React.createElement(PlanningFilters, {
      value: emptyFilters(),
      onChange: () => undefined,
      onClear: () => undefined,
      statusOptions: [{ value: "TODO", label: "TODO" }],
      typeOptions: [{ value: "USER_STORY", label: "USER STORY" }],
      labelOptions: [{ value: "l-web", label: "WEB" }],
      epicOptions: [{ value: "e-1", label: "MC-44 Web Early Access" }],
      assigneeOptions: [{ value: "a-1", label: "Naomi N" }],
    }),
  );

  assert.match(html, /Search by key or title/);
  assert.match(html, /Clear/);
});
