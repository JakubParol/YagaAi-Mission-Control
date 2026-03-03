import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanningSettingsViewModel,
  getMockPlanningSettingsViewModel,
} from "./adapter.js";
import { planningSettingsFixture } from "./fixtures.js";

const SHARED_STATUS_SET = [
  "TODO",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "VERIFY",
  "DONE",
] as const;

test("planning settings adapter exposes all six settings sections", () => {
  const viewModel = getMockPlanningSettingsViewModel();

  assert.deepEqual(Object.keys(viewModel).sort(), [
    "assignment_defaults",
    "audit_activity",
    "backlog_policy",
    "label_taxonomy",
    "project_defaults",
    "workflow",
  ]);
});

test("planning settings adapter keeps enum sets and entity-field mappings aligned", () => {
  const viewModel = buildPlanningSettingsViewModel(planningSettingsFixture);

  assert.deepEqual(viewModel.workflow.story_statuses, SHARED_STATUS_SET);
  assert.deepEqual(viewModel.workflow.task_statuses, SHARED_STATUS_SET);
  assert.deepEqual(viewModel.backlog_policy.kinds, ["BACKLOG", "SPRINT", "IDEAS"]);

  const selectedProject = viewModel.project_defaults.selected_project;
  assert.ok(selectedProject);
  assert.equal(typeof selectedProject.repo_root, "string");
  assert.equal(selectedProject.status, "ACTIVE");
  assert.equal(selectedProject.is_default, 1);

  const planningLabel = viewModel.label_taxonomy.labels.find(
    (label) => label.name === "planning",
  );

  assert.ok(planningLabel);
  assert.equal(planningLabel.project_id, "17dcdfd3-8b65-480f-b254-22835537c6a8");
  assert.equal(planningLabel.story_count, 2);
  assert.equal(planningLabel.task_count, 2);
});
