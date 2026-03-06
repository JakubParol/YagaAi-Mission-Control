import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanningListRows,
  COMING_SOON_LABEL,
} from "./list-view-model.js";

test("buildPlanningListRows composes stories and standalone tasks sorted by updated_at desc", () => {
  const rows = buildPlanningListRows({
    stories: [
      {
        id: "story-1",
        epic_id: "epic-1",
        current_assignee_agent_id: "agent-1",
        key: "MC-10",
        title: "Story one",
        story_type: "USER_STORY",
        status: "TODO",
        priority: 2,
        updated_at: "2026-03-01T10:00:00Z",
      },
      {
        id: "story-2",
        epic_id: null,
        current_assignee_agent_id: null,
        key: "MC-11",
        title: "Story two",
        story_type: "BUG",
        status: "IN_PROGRESS",
        priority: 1,
        updated_at: "2026-03-01T09:00:00Z",
      },
    ],
    backlogStories: [
      {
        id: "story-1",
        key: "MC-10",
        title: "Story one",
        story_type: "USER_STORY",
        status: "TODO",
        priority: 2,
        epic_key: "MC-1",
        epic_title: "Platform",
        labels: [{ id: "label-1", name: "frontend", color: "#22c55e" }],
      },
    ],
    standaloneTaskCandidates: [
      {
        id: "task-standalone",
        story_id: null,
        current_assignee_agent_id: "agent-2",
        key: "MC-12",
        title: "Standalone task",
        objective: "Do standalone work",
        task_type: "CHORE",
        status: "VERIFY",
        priority: 3,
        updated_at: "2026-03-01T11:00:00Z",
      },
      {
        id: "task-linked",
        story_id: "story-1",
        current_assignee_agent_id: "agent-1",
        key: "MC-13",
        title: "Linked task",
        objective: null,
        task_type: "CHORE",
        status: "TODO",
        priority: null,
        updated_at: "2026-03-01T12:00:00Z",
      },
    ],
    epics: [{ id: "epic-1", key: "MC-1", title: "Platform" }],
  });

  assert.deepEqual(
    rows.map((row) => `${row.row_type}:${row.id}`),
    ["task:task-standalone", "story:story-1", "story:story-2"],
  );

  assert.deepEqual(rows[1].labels.map((label) => label.name), ["frontend"]);
  assert.equal(rows[1].epic_key, "MC-1");
  assert.equal(rows[1].epic_title, "Platform");
  assert.equal(rows[1].epic_id, "epic-1");
  assert.equal(rows[1].current_assignee_agent_id, "agent-1");
  assert.equal(rows[1].task_count, 1);
  assert.equal(rows[1].done_task_count, 0);
  assert.equal(rows[2].task_count, 0);
  assert.equal(rows[2].done_task_count, 0);
  assert.equal(rows[0].task_type, "CHORE");
  assert.equal(rows[0].objective, "Do standalone work");
  assert.equal(rows[0].current_assignee_agent_id, "agent-2");
});

test("list-view mocked controls contract stays explicit", () => {
  assert.equal(COMING_SOON_LABEL, "Coming soon");
});
