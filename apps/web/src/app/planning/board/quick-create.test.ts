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
    type: "STORY",
    title: "Add sprint goal copy",
    sub_type: "TASK",
    project_id: "p1",
    current_assignee_agent_id: "agent-1",
    metadata_json: JSON.stringify({
      quick_create_assignee_agent_id: "agent-1",
      quick_create_source: "board_todo_column",
    }),
  })
})

test("createTodoQuickItem performs create + product backlog + sprint attach flow and returns TODO story card data", async () => {
  const originalFetch = globalThis.fetch
  const requestUrls: string[] = []
  const requestBodies: unknown[] = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrls.push(String(input))
    requestBodies.push(init?.body ? JSON.parse(String(init.body)) : null)

    if (requestUrls.length === 1) {
      return jsonResponse(201, {
        id: "s-1",
        key: "MC-999",
        title: "Fix flaky board refresh",
        status: "TODO",
        sub_type: "BUG",
        priority: 1,
      })
    }

    if (requestUrls.length === 2) {
      return jsonResponse(200, {
        data: [{ id: "b-product", is_default: true, created_at: "2026-03-01T00:00:00Z" }],
      })
    }

    return jsonResponse(200, { data: { work_item_id: "s-1", backlog_id: "b-1" } })
  }) as typeof fetch

  try {
    const created = await createTodoQuickItem({
      projectId: "p1",
      subject: "  Fix flaky board refresh ",
      workType: "BUG",
      assigneeAgentId: "agent-2",
    })

    assert.equal(requestUrls.length, 4)
    assert.equal(requestUrls[0].endsWith("/v1/planning/work-items"), true)
    assert.equal(requestUrls[1].includes("/v1/planning/backlogs?project_id=p1"), true)
    assert.equal(
      requestUrls[2].includes("/v1/planning/backlogs/b-product/items"),
      true,
    )
    assert.equal(
      requestUrls[3].includes("/v1/planning/backlogs/active-sprint/items?project_id=p1"),
      true,
    )
    assert.deepEqual(requestBodies[2], { work_item_id: "s-1" })
    assert.deepEqual(requestBodies[3], { work_item_id: "s-1" })
    assert.equal(created.id, "s-1")
    assert.equal(created.status, "TODO")
    assert.equal(created.sub_type, "BUG")
    assert.equal(created.assignee_agent_id, "agent-2")
    assert.equal(created.children_count, 0)
    assert.equal(typeof created.rank, "string")
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
    if (callCount === 1) return jsonResponse(201, { id: "s-2", title: "Task 2" })
    if (callCount === 2) {
      return jsonResponse(200, {
        data: [{ id: "b-product", is_default: true, created_at: "2026-03-01T00:00:00Z" }],
      })
    }
    if (callCount === 3) {
      return jsonResponse(200, { data: { work_item_id: "s-2", backlog_id: "b-product" } })
    }
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

test("quick-add create flow order supports USER_STORY, TASK and BUG without sprint membership violations", async () => {
  const originalFetch = globalThis.fetch
  const workTypes = ["USER_STORY", "TASK", "BUG"] as const

  try {
    for (const workType of workTypes) {
      const requestUrls: string[] = []
      const requestBodies: unknown[] = []

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrls.push(String(input))
        requestBodies.push(init?.body ? JSON.parse(String(init.body)) : null)
        const callIndex = requestUrls.length

        if (callIndex === 1) {
          return jsonResponse(201, {
            id: `s-${workType}`, title: `${workType} item`, sub_type: workType,
          })
        }
        if (callIndex === 2) {
          return jsonResponse(200, {
            data: [{ id: "b-product", is_default: true, created_at: "2026-03-01T00:00:00Z" }],
          })
        }
        return jsonResponse(200, { data: {} })
      }) as typeof fetch

      const created = await createTodoQuickItem({
        projectId: "p1",
        subject: `${workType} title`,
        workType,
        assigneeAgentId: null,
      })

      assert.equal(created.sub_type, workType)
      assert.equal(requestUrls.length, 4)
      assert.equal(requestUrls[1].includes("/v1/planning/backlogs?project_id=p1"), true)
      assert.equal(requestUrls[2].includes("/v1/planning/backlogs/b-product/items"), true)
      assert.equal(
        requestUrls[3].includes("/v1/planning/backlogs/active-sprint/items?project_id=p1"),
        true,
      )
      assert.deepEqual(
        requestBodies[0],
        {
          type: "STORY",
          title: `${workType} title`,
          sub_type: workType,
          project_id: "p1",
          current_assignee_agent_id: null,
          metadata_json: null,
        },
      )
      assert.deepEqual(requestBodies[2], { work_item_id: `s-${workType}` })
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("toQuickCreateErrorMessage falls back to phase-specific generic text", async () => {
  const createMessage = await toQuickCreateErrorMessage(jsonResponse(500, {}), "create")
  const prepareMessage = await toQuickCreateErrorMessage(jsonResponse(500, {}), "prepare")
  const attachMessage = await toQuickCreateErrorMessage(jsonResponse(500, {}), "attach")

  assert.equal(createMessage, "Failed to create work item. HTTP 500.")
  assert.equal(
    prepareMessage,
    "Work item was created but could not be prepared for sprint membership. HTTP 500.",
  )
  assert.equal(
    attachMessage,
    "Work item was created but could not be added to the active sprint. HTTP 500.",
  )
})
