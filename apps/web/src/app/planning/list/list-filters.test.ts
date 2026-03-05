import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlanningListFilters,
  buildStatusOptions,
  buildTypeOptions,
  UNASSIGNED_FILTER_VALUE,
  type PlanningListFilters,
} from "./list-filters.js";
import type { PlanningListRow } from "./list-view-model.js";

const ROWS: PlanningListRow[] = [
  {
    row_type: "story",
    id: "story-1",
    key: "MC-10",
    title: "Build planning list filters",
    status: "TODO",
    priority: 1,
    epic_id: "epic-1",
    epic_key: "MC-1",
    epic_title: "Planning",
    labels: [{ id: "label-frontend", name: "frontend", color: "#00ff00" }],
    current_assignee_agent_id: "agent-1",
    updated_at: "2026-03-01T10:00:00Z",
    story_type: "USER_STORY",
    task_type: null,
    objective: null,
  },
  {
    row_type: "story",
    id: "story-2",
    key: "MC-11",
    title: "Fix filter dropdown bug",
    status: "IN_PROGRESS",
    priority: 2,
    epic_id: null,
    epic_key: null,
    epic_title: null,
    labels: [{ id: "label-bug", name: "bugfix", color: "#ff0000" }],
    current_assignee_agent_id: null,
    updated_at: "2026-03-01T09:00:00Z",
    story_type: "BUG",
    task_type: null,
    objective: null,
  },
  {
    row_type: "task",
    id: "task-1",
    key: "MC-12",
    title: "Refactor list rendering",
    status: "DONE",
    priority: null,
    epic_id: null,
    epic_key: null,
    epic_title: null,
    labels: [],
    current_assignee_agent_id: "agent-2",
    updated_at: "2026-03-01T08:00:00Z",
    story_type: null,
    task_type: "CHORE",
    objective: "Cleanup",
  },
];

function filters(overrides: Partial<PlanningListFilters> = {}): PlanningListFilters {
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

test("applyPlanningListFilters combines all filters using AND semantics", () => {
  const result = applyPlanningListFilters(
    ROWS,
    filters({
      search: "planning",
      status: "TODO",
      type: "USER_STORY",
      labelId: "label-frontend",
      epicId: "epic-1",
      assignee: "agent-1",
    }),
  );

  assert.deepEqual(result.map((row) => row.id), ["story-1"]);
});

test("applyPlanningListFilters supports unassigned assignee filter", () => {
  const result = applyPlanningListFilters(
    ROWS,
    filters({ assignee: UNASSIGNED_FILTER_VALUE }),
  );

  assert.deepEqual(result.map((row) => row.id), ["story-2"]);
});

test("buildTypeOptions and buildStatusOptions expose unique normalized values", () => {
  assert.deepEqual(buildTypeOptions(ROWS), [
    { value: "BUG", label: "BUG" },
    { value: "TASK", label: "TASK" },
    { value: "USER_STORY", label: "USER STORY" },
  ]);

  assert.deepEqual(buildStatusOptions(ROWS), [
    { value: "DONE", label: "DONE" },
    { value: "IN_PROGRESS", label: "IN PROGRESS" },
    { value: "TODO", label: "TODO" },
  ]);
});

