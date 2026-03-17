import assert from "node:assert/strict";
import test from "node:test";

import {
  addOptimisticTask,
  applyOptimisticTaskPatch,
  createOptimisticTask,
  removeTask,
  replaceTask,
  rollbackTaskPatch,
  toTaskStatusDonePatch,
} from "./task-optimistic.js";
import type { TaskItemView } from "./story-types.js";

function taskFixture(id: string, status: TaskItemView["status"]): TaskItemView {
  return {
    id,
    key: null,
    title: `Task ${id}`,
    summary: null,
    sub_type: "CODING",
    status,
    priority: 3,
    is_blocked: false,
    blocked_reason: null,
    estimate_points: 2,
    due_at: null,
    current_assignee_agent_id: null,
  };
}

test("createOptimisticTask builds TODO task with draft values", () => {
  const task = createOptimisticTask(
    {
      storyId: "s1",
      title: "Add endpoint",
      summary: "Ship API",
      sub_type: "CODING",
      priority: 2,
      estimate_points: 3,
      due_at: "2026-03-10",
    },
    "temp-1",
  );

  assert.equal(task.id, "temp-1");
  assert.equal(task.status, "TODO");
  assert.equal(task.title, "Add endpoint");
  assert.equal(task.priority, 2);
});

test("task list helpers add, replace and remove tasks", () => {
  const t1 = taskFixture("1", "TODO");
  const t2 = taskFixture("2", "IN_PROGRESS");
  const added = addOptimisticTask([t2], t1);
  assert.deepEqual(
    added.map((task) => task.id),
    ["1", "2"],
  );

  const replaced = replaceTask(added, "1", { ...t1, title: "Updated" });
  assert.equal(replaced[0].title, "Updated");

  const removed = removeTask(replaced, "2");
  assert.deepEqual(
    removed.map((task) => task.id),
    ["1"],
  );
});

test("applyOptimisticTaskPatch returns previous task and supports rollback", () => {
  const tasks = [taskFixture("1", "TODO"), taskFixture("2", "IN_PROGRESS")];
  const patched = applyOptimisticTaskPatch(tasks, "1", {
    status: "DONE",
    title: "Completed task",
  });

  assert.equal(patched.previousTask?.status, "TODO");
  assert.equal(patched.nextTasks[0].status, "DONE");
  assert.equal(patched.nextTasks[0].title, "Completed task");

  const rolledBack = rollbackTaskPatch(patched.nextTasks, "1", patched.previousTask);
  assert.equal(rolledBack[0].status, "TODO");
  assert.equal(rolledBack[0].title, "Task 1");
});

test("toTaskStatusDonePatch returns DONE status", () => {
  assert.equal(toTaskStatusDonePatch().status, "DONE");
});
