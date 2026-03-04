import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoryCreatePayload,
  createTodoQuickItem,
  isQuickCreateCancelKey,
  isQuickCreateSubmitKey,
  toQuickCreateErrorMessage,
  validateQuickCreateSubject,
} from "./quick-create.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("validateQuickCreateSubject rejects blank values", () => {
  assert.equal(validateQuickCreateSubject(""), "Subject is required.")
  assert.equal(validateQuickCreateSubject("   "), "Subject is required.")
  assert.equal(validateQuickCreateSubject("Ship board quick create"), null)
})

test("keyboard helper functions match enter submit and escape cancel", () => {
  assert.equal(isQuickCreateSubmitKey("Enter", false), true)
  assert.equal(isQuickCreateSubmitKey("Enter", true), false)
  assert.equal(isQuickCreateSubmitKey("Space", false), false)
  assert.equal(isQuickCreateCancelKey("Escape"), true)
  assert.equal(isQuickCreateCancelKey("Enter"), false)
})

test("buildStoryCreatePayload trims subject and includes assignee metadata", () => {
  const payload = buildStoryCreatePayload({
    projectId: "p1",
    subject: "  Add sprint goal copy  ",
    workType: "TASK",
    assigneeAgentId: "agent-1",
  })

  assert.deepEqual(payload, {
    title: "Add sprint goal copy",
    story_type: "TASK",
    project_id: "p1",
    metadata_json: JSON.stringify({
      quick_create_assignee_agent_id: "agent-1",
      quick_create_source: "board_todo_column",
    }),
  })
})

test("createTodoQuickItem performs create + attach flow and returns TODO story card data", async () => {
  const originalFetch = globalThis.fetch
  const requestUrls: string[] = []
  const requestBodies: unknown[] = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrls.push(String(input))
    requestBodies.push(init?.body ? JSON.parse(String(init.body)) : null)

    if (requestUrls.length === 1) {
      return jsonResponse(201, {
        data: {
          id: "s-1",
          key: "MC-999",
          title: "Fix flaky board refresh",
          status: "TODO",
          story_type: "BUG",
          priority: 1,
        },
      })
    }

    return jsonResponse(200, { data: { story_id: "s-1", backlog_id: "b-1", position: 0 } })
  }) as typeof fetch

  try {
    const created = await createTodoQuickItem({
      projectId: "p1",
      subject: "  Fix flaky board refresh ",
      workType: "BUG",
      assigneeAgentId: "agent-2",
    })

    assert.equal(requestUrls.length, 2)
    assert.equal(requestUrls[0].endsWith("/v1/planning/stories"), true)
    assert.equal(
      requestUrls[1].includes("/v1/planning/backlogs/active-sprint/stories?project_id=p1"),
      true,
    )
    assert.deepEqual(requestBodies[1], { story_id: "s-1", position: 0 })
    assert.equal(created.id, "s-1")
    assert.equal(created.status, "TODO")
    assert.equal(created.story_type, "BUG")
    assert.equal(created.task_count, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("createTodoQuickItem rejects immediately on validation failure", async () => {
  await assert.rejects(
    () =>
      createTodoQuickItem({
        projectId: "p1",
        subject: " ",
        workType: "USER_STORY",
        assigneeAgentId: null,
      }),
    {
      message: "Subject is required.",
    },
  )
})

test("createTodoQuickItem surfaces create API validation errors", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    jsonResponse(422, {
      detail: [{ loc: ["body", "title"], msg: "String should have at least 1 characters" }],
    })) as typeof fetch

  try {
    await assert.rejects(
      () =>
        createTodoQuickItem({
          projectId: "p1",
          subject: "Bug",
          workType: "BUG",
          assigneeAgentId: null,
        }),
      {
        message: "String should have at least 1 characters",
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("maps attach not-found errors to active sprint guidance", async () => {
  const originalFetch = globalThis.fetch
  let callCount = 0

  globalThis.fetch = (async () => {
    callCount += 1
    if (callCount === 1) return jsonResponse(201, { data: { id: "s-2", title: "Task 2" } })
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "No active sprint" } })
  }) as typeof fetch

  try {
    await assert.rejects(
      () =>
        createTodoQuickItem({
          projectId: "p1",
          subject: "Task 2",
          workType: "TASK",
          assigneeAgentId: null,
        }),
      {
        message: "Active sprint was not found for the selected project.",
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("toQuickCreateErrorMessage falls back to phase-specific generic text", async () => {
  const createMessage = await toQuickCreateErrorMessage(jsonResponse(500, {}), "create")
  const attachMessage = await toQuickCreateErrorMessage(jsonResponse(500, {}), "attach")

  assert.equal(createMessage, "Failed to create work item. HTTP 500.")
  assert.equal(
    attachMessage,
    "Work item was created but could not be added to the active sprint. HTTP 500.",
  )
})
